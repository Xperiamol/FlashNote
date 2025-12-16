/**
 * FlashNote v3.0 原子化同步系统 - 存储适配器
 *
 * 提供统一的本地数据访问接口，支持原子化读写
 */

const path = require('path');
const { app } = require('electron');
const NoteDAO = require('../../dao/NoteDAO');
const TodoDAO = require('../../dao/TodoDAO');
const DatabaseManager = require('../../dao/DatabaseManager');
const hashUtils = require('./utils/hash');

/**
 * 存储适配器类
 *
 * 负责桥接数据库 DAO 层和同步引擎
 */
class StorageAdapter {
  constructor() {
    this.dbManager = DatabaseManager.getInstance();
    this.db = this.dbManager.getDatabase();
    this.noteDAO = new NoteDAO(this.dbManager);
    this.todoDAO = new TodoDAO(this.dbManager);
  }

  /**
   * 获取所有笔记（包括白板），按 sync_id 索引
   *
   * @param {boolean} [includeDeleted=true] - 是否包含已删除的项
   * @returns {Promise<Record<string, import('./types').NoteItem>>} sync_id -> NoteItem 映射
   */
  async getAllNotes(includeDeleted = true) {
    const query = includeDeleted
      ? `SELECT * FROM notes ORDER BY updated_at DESC`
      : `SELECT * FROM notes WHERE is_deleted = 0 ORDER BY updated_at DESC`;

    const rows = this.db.prepare(query).all();

    console.log(`[StorageAdapter] getAllNotes(${includeDeleted}): 查询到 ${rows.length} 条记录`);

    const notesMap = {};
    for (const row of rows) {
      const syncId = row.sync_id || row.id.toString();
      console.log(`[StorageAdapter] 笔记 id=${row.id}, sync_id=${row.sync_id}, is_deleted=${row.is_deleted} -> key=${syncId}`);
      notesMap[syncId] = this.normalizeNote(row);
    }

    return notesMap;
  }

  /**
   * 根据 sync_id 获取单个笔记
   *
   * @param {string} syncId - sync_id
   * @param {boolean} [includeDeleted=true] - 是否包含已删除的项
   * @returns {Promise<import('./types').NoteItem|null>} 笔记数据
   */
  async getNoteById(syncId, includeDeleted = true) {
    // 先尝试通过 sync_id 查找
    let query = includeDeleted
      ? `SELECT * FROM notes WHERE sync_id = ?`
      : `SELECT * FROM notes WHERE sync_id = ? AND is_deleted = 0`;

    let row = this.db.prepare(query).get(syncId);

    // 如果没找到，尝试通过数字 id 查找（兼容旧数据）
    if (!row) {
      query = includeDeleted
        ? `SELECT * FROM notes WHERE id = ?`
        : `SELECT * FROM notes WHERE id = ? AND is_deleted = 0`;
      row = this.db.prepare(query).get(syncId);
    }

    return row ? this.normalizeNote(row) : null;
  }

  /**
   * 获取所有待办事项，按 sync_id 索引
   *
   * @param {boolean} [includeDeleted=true] - 是否包含已删除的项
   * @returns {Promise<Record<string, import('./types').TodoItem>>} sync_id -> TodoItem 映射
   */
  async getAllTodos(includeDeleted = true) {
    const query = includeDeleted
      ? `SELECT * FROM todos ORDER BY updated_at DESC`
      : `SELECT * FROM todos WHERE is_deleted = 0 ORDER BY updated_at DESC`;

    const rows = this.db.prepare(query).all();

    const todosMap = {};
    for (const row of rows) {
      const syncId = row.sync_id || row.id.toString();
      todosMap[syncId] = this.normalizeTodo(row);
    }

    return todosMap;
  }

  /**
   * 根据 sync_id 获取单个待办
   *
   * @param {string} syncId - sync_id
   * @param {boolean} [includeDeleted=true] - 是否包含已删除的项
   * @returns {Promise<import('./types').TodoItem|null>} 待办数据
   */
  async getTodoById(syncId, includeDeleted = true) {
    const query = includeDeleted
      ? `SELECT * FROM todos WHERE sync_id = ?`
      : `SELECT * FROM todos WHERE sync_id = ? AND is_deleted = 0`;

    const row = this.db.prepare(query).get(syncId);
    return row ? this.normalizeTodo(row) : null;
  }

  /**
   * 获取所有设置
   *
   * @returns {Promise<import('./types').SettingsData>} 设置数据
   */
  async getAllSettings() {
    const query = `SELECT key, value, type FROM settings`;
    const rows = this.db.prepare(query).all();

    const settings = {};
    for (const row of rows) {
      try {
        // 根据类型解析 value
        if (row.type === 'json' || row.type === 'object') {
          settings[row.key] = JSON.parse(row.value);
        } else if (row.type === 'number') {
          settings[row.key] = Number(row.value);
        } else if (row.type === 'boolean') {
          settings[row.key] = row.value === 'true' || row.value === '1';
        } else {
          settings[row.key] = row.value;
        }
      } catch (error) {
        console.warn(`[StorageAdapter] 解析设置失败: ${row.key}`, error);
        settings[row.key] = row.value;
      }
    }

    return settings;
  }

  /**
   * 创建或更新笔记（原子操作）
   *
   * @param {import('./types').NoteItem} noteData - 笔记数据
   * @param {boolean} [skipChangeLog=true] - 是否跳过变更日志（同步时必须跳过）
   * @returns {Promise<void>}
   */
  async upsertNote(noteData, skipChangeLog = true) {
    const existing = await this.getNoteById(noteData.id, true);

    if (existing) {
      // 更新
      await this.noteDAO.update(
        existing.db_id || existing.id,
        {
          title: noteData.title,
          content: noteData.content,
          note_type: noteData.note_type,
          tags: noteData.tags,
          category: noteData.category,
          is_pinned: noteData.is_pinned,
          is_deleted: noteData.is_deleted || 0,
          deleted_at: noteData.deleted_at,
          updated_at: this.toSQLiteDateTime(noteData.updated_at),
        },
        { skipChangeLog }
      );
    } else {
      // 创建
      await this.noteDAO.create(
        {
          sync_id: noteData.id,
          title: noteData.title,
          content: noteData.content,
          note_type: noteData.note_type,
          tags: noteData.tags,
          category: noteData.category,
          is_pinned: noteData.is_pinned,
          created_at: this.toSQLiteDateTime(noteData.created_at),
          updated_at: this.toSQLiteDateTime(noteData.updated_at),
        },
        { skipChangeLog }
      );
    }
  }

  /**
   * 创建或更新待办（原子操作）
   *
   * @param {import('./types').TodoItem} todoData - 待办数据
   * @param {boolean} [skipChangeLog=true] - 是否跳过变更日志
   * @returns {Promise<void>}
   */
  async upsertTodo(todoData, skipChangeLog = true) {
    const existing = await this.getTodoById(todoData.id, true);

    // 处理删除状态
    if (todoData.is_deleted === 1) {
      if (existing) {
        // 远程已删除，本地存在，执行软删除
        await this.softDeleteTodo(todoData.id, skipChangeLog);
      }
      // 如果本地不存在且远程已删除，不需要创建（跳过）
      return;
    }

    // 规范化数据：确保所有字段都是 SQLite 兼容的类型
    // undefined -> null, boolean -> 0/1, 确保数值类型正确
    const normalizedData = {
      content: todoData.content ?? '',
      description: todoData.description ?? '',
      tags: todoData.tags ?? '',
      is_completed: this.toSQLiteBoolean(todoData.done),
      due_date: todoData.due_date ?? null,
      end_date: todoData.end_date ?? null,
      focus_time_seconds: this.toSQLiteNumber(todoData.focus_time_seconds, 0),
      is_important: this.toSQLiteBoolean(todoData.is_important),
      is_urgent: this.toSQLiteBoolean(todoData.is_urgent),
      repeat_type: todoData.repeat_type ?? 'none',
      repeat_days: todoData.repeat_days ?? '',
      repeat_interval: this.toSQLiteNumber(todoData.repeat_interval, 1),
      next_due_date: todoData.next_due_date ?? null,
      is_recurring: this.toSQLiteBoolean(todoData.is_recurring),
      parent_todo_id: todoData.parent_todo_id ?? null,
      item_type: todoData.item_type ?? 'todo',
      has_time: this.toSQLiteBoolean(todoData.has_time),
      is_deleted: this.toSQLiteBoolean(todoData.is_deleted),
      updated_at: this.toSQLiteDateTime(todoData.updated_at),
    };

    if (existing) {

      // 更新
      await this.todoDAO.update(
        existing.db_id || existing.id,
        normalizedData,
        { skipChangeLog }
      );
    } else {
      // 创建
      await this.todoDAO.create(
        {
          sync_id: todoData.id,
          ...normalizedData,
          created_at: this.toSQLiteDateTime(todoData.created_at),
          updated_at: this.toSQLiteDateTime(todoData.updated_at),
        },
        { skipChangeLog }
      );
    }
  }

  /**
   * 软删除笔记
   *
   * @param {string} syncId - sync_id
   * @param {boolean} [skipChangeLog=true] - 是否跳过变更日志
   * @returns {Promise<void>}
   */
  async softDeleteNote(syncId, skipChangeLog = true) {
    const existing = await this.getNoteById(syncId, true);
    if (existing) {
      await this.noteDAO.softDelete(existing.db_id || existing.id, { skipChangeLog });
    }
  }

  /**
   * 软删除待办
   *
   * @param {string} syncId - sync_id
   * @param {boolean} [skipChangeLog=true] - 是否跳过变更日志
   * @returns {Promise<void>}
   */
  async softDeleteTodo(syncId, skipChangeLog = true) {
    const existing = await this.getTodoById(syncId, true);
    if (existing) {
      await this.todoDAO.softDelete(existing.db_id || existing.id, { skipChangeLog });
    }
  }

  /**
   * 批量更新设置
   *
   * @param {import('./types').SettingsData} settings - 设置数据
   * @returns {Promise<void>}
   */
  async updateSettings(settings) {
    const upsertStmt = this.db.prepare(`
      INSERT INTO settings (key, value, type)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type
    `);

    const transaction = this.db.transaction((entries) => {
      for (const [key, value] of entries) {
        const { serialized, type } = this.serializeSettingValue(value);
        upsertStmt.run(key, serialized, type);
      }
    });

    transaction(Object.entries(settings));
  }

  /**
   * 计算笔记的 Hash
   *
   * @param {import('./types').NoteItem} note - 笔记数据
   * @returns {string} MD5 hash
   */
  calculateNoteHash(note) {
    if (note.note_type === 'whiteboard') {
      // 白板使用 JSON hash
      return hashUtils.calculateJsonHash(
        {
          title: note.title,
          content: note.content,
        },
        ['updated_at']
      );
    } else {
      // Markdown 笔记
      return hashUtils.calculateMarkdownHash(note.content || '');
    }
  }

  /**
   * 计算待办的 Hash
   *
   * @param {import('./types').TodoItem} todo - 待办数据
   * @returns {string} MD5 hash
   */
  calculateTodoHash(todo) {
    const { updated_at, ...rest } = todo;
    return hashUtils.calculateJsonHash(rest);
  }

  /**
   * 计算所有待办的 Hash
   *
   * @param {Array<import('./types').TodoItem>} todos - 待办列表
   * @returns {string} MD5 hash
   */
  calculateTodosHash(todos) {
    return hashUtils.calculateTodosHash(todos);
  }

  /**
   * 计算设置的 Hash
   *
   * @param {import('./types').SettingsData} settings - 设置数据
   * @returns {string} MD5 hash
   */
  calculateSettingsHash(settings) {
    return hashUtils.calculateSettingsHash(settings);
  }

  // ==================== 私有方法 ====================

  /**
   * 规范化数据库笔记行为标准格式
   * @private
   */
  normalizeNote(row) {
    return {
      id: row.sync_id || row.id.toString(),
      db_id: row.id, // 保留数据库 ID 用于更新
      title: row.title || '',
      content: row.content || '',
      note_type: row.note_type || 'markdown',
      created_at: this.parseTimestamp(row.created_at),
      updated_at: this.parseTimestamp(row.updated_at),
      tags: row.tags || '',
      category: row.category || '',
      is_pinned: row.is_pinned || 0,
      is_deleted: row.is_deleted || 0,
      deleted_at: row.deleted_at ? this.parseTimestamp(row.deleted_at) : null,
    };
  }

  /**
   * 规范化数据库待办行为标准格式
   * @private
   */
  normalizeTodo(row) {
    return {
      id: row.sync_id || row.id.toString(),
      db_id: row.id, // 保留数据库 ID 用于更新
      content: row.content || '',
      description: row.description || '',
      tags: row.tags || '',
      done: Boolean(row.is_completed),
      created_at: this.parseTimestamp(row.created_at),
      updated_at: this.parseTimestamp(row.updated_at),
      due_date: row.due_date || null,
      end_date: row.end_date || null,
      // 使用正确的数据库字段名 focus_time_seconds
      focus_time_seconds: row.focus_time_seconds || 0,
      // 四象限相关字段
      is_important: row.is_important || 0,
      is_urgent: row.is_urgent || 0,
      // 重复相关字段
      repeat_type: row.repeat_type || 'none',
      repeat_days: row.repeat_days || '',
      repeat_interval: row.repeat_interval || 1,
      next_due_date: row.next_due_date || null,
      is_recurring: row.is_recurring || 0,
      parent_todo_id: row.parent_todo_id || null,
      // 其他字段
      item_type: row.item_type || 'todo',
      has_time: row.has_time || 0,
      is_deleted: row.is_deleted || 0,
      deleted_at: row.deleted_at ? this.parseTimestamp(row.deleted_at) : null,
      completed_at: row.completed_at ? this.parseTimestamp(row.completed_at) : null,
    };
  }

  /**
   * 解析时间戳
   * @public - 供 SyncEngine 使用
   */
  parseTimestamp(value) {
    if (value === undefined || value === null || value === '') return 0;

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    const str = String(value).trim();
    if (!str) return 0;

    // 纯数字字符串：当作毫秒时间戳
    if (/^\d+$/.test(str)) {
      const n = Number(str);
      return Number.isFinite(n) ? n : 0;
    }

    // SQLite CURRENT_TIMESTAMP 通常为 UTC 的 "YYYY-MM-DD HH:MM:SS"，转成 ISO + Z
    let t;
    if (str.includes('T') || str.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
      t = new Date(str).getTime();
    } else {
      t = new Date(str.replace(' ', 'T') + 'Z').getTime();
    }

    if (!Number.isFinite(t) || isNaN(t)) {
      t = new Date(str).getTime();
    }

    return Number.isFinite(t) && !isNaN(t) ? t : 0;
  }

  /**
   * 将值转换为 SQLite 兼容的布尔值（0 或 1）
   * @private
   */
  toSQLiteBoolean(value) {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value ? 1 : 0;
    return 0;
  }

  /**
   * 将值转换为 SQLite 兼容的数字
   * @private
   */
  toSQLiteNumber(value, defaultValue = 0) {
    if (value === undefined || value === null) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * 将时间转换为 SQLite UTC 时间字符串 "YYYY-MM-DD HH:MM:SS"
   * @private
   */
  toSQLiteDateTime(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    // number / numeric string
    if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))) {
      const ms = typeof value === 'number' ? value : Number(value.trim());
      if (!Number.isFinite(ms)) return null;
      return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    }

    if (typeof value === 'string') {
      const str = value.trim();
      if (!str) return null;

      // 已是 SQLite 格式就直接返回
      if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(str)) {
        return str;
      }

      const ms = new Date(str).getTime();
      if (!Number.isFinite(ms) || isNaN(ms)) return null;
      return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    }

    return null;
  }

  /**
   * 序列化设置值
   * @private
   */
  serializeSettingValue(value) {
    if (typeof value === 'object' && value !== null) {
      return { serialized: JSON.stringify(value), type: 'json' };
    } else if (typeof value === 'number') {
      return { serialized: String(value), type: 'number' };
    } else if (typeof value === 'boolean') {
      return { serialized: value ? '1' : '0', type: 'boolean' };
    } else {
      return { serialized: String(value), type: 'string' };
    }
  }
}

module.exports = StorageAdapter;
