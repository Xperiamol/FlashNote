const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = null;
  }

  /**
   * 初始化数据库连接
   */
  async initialize() {
    try {
      // 获取用户数据目录
      const userDataPath = app.getPath('userData');
      const dbDir = path.join(userDataPath, 'database');
      
      // 确保数据库目录存在
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      this.dbPath = path.join(dbDir, 'flashnote.db');
      
      // 创建数据库连接
      this.db = new Database(this.dbPath);
      
      // 启用外键约束
      this.db.pragma('foreign_keys = ON');
      
      // 设置WAL模式以提高并发性能
      this.db.pragma('journal_mode = WAL');
      
      // 创建表结构
    await this.createTables();
    
    // 执行数据库迁移
    await this.runMigrations();
    
    console.log('数据库初始化成功:', this.dbPath);
      return true;
    } catch (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建数据库表结构
   */
  async createTables() {
    const tables = [
      // 笔记表
      `CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        tags TEXT DEFAULT '',
        category TEXT DEFAULT 'default',
        is_pinned INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL
      )`,
      
      // 设置表
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT DEFAULT 'string',
        description TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // 分类表
      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#1976d2',
        icon TEXT DEFAULT 'folder',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // 标签表
      `CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#666666',
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // 待办事项表
      `CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '',
        is_completed INTEGER DEFAULT 0,
        is_important INTEGER DEFAULT 0,
        is_urgent INTEGER DEFAULT 0,
        due_date DATETIME NULL,
        focus_time_seconds INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL
      )`,
      
      // 变更日志表 - 用于增量同步
      `CREATE TABLE IF NOT EXISTS changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        operation TEXT NOT NULL,
        change_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0,
        synced_at DATETIME NULL
      )`
    ];

    // 创建索引
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)',
      'CREATE INDEX IF NOT EXISTS idx_notes_is_pinned ON notes(is_pinned)',
      'CREATE INDEX IF NOT EXISTS idx_notes_is_deleted ON notes(is_deleted)',
      'CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title)',
      'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)',
      'CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date)',
      'CREATE INDEX IF NOT EXISTS idx_todos_is_completed ON todos(is_completed)',
      'CREATE INDEX IF NOT EXISTS idx_todos_is_important ON todos(is_important)',
      'CREATE INDEX IF NOT EXISTS idx_todos_is_urgent ON todos(is_urgent)',
      'CREATE INDEX IF NOT EXISTS idx_changes_entity ON changes(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_changes_synced ON changes(synced)',
      'CREATE INDEX IF NOT EXISTS idx_changes_created_at ON changes(created_at DESC)'
    ];

    // 执行建表语句
    for (const sql of tables) {
      this.db.exec(sql);
    }

    // 执行索引创建语句
    for (const sql of indexes) {
      this.db.exec(sql);
    }

    // 插入默认设置
    await this.insertDefaultSettings();
    
    // 插入默认分类
    await this.insertDefaultCategories();
  }

  /**
   * 插入默认设置
   */
  async insertDefaultSettings() {
    const defaultSettings = [
      { key: 'theme_mode', value: 'light', type: 'string', description: '主题模式' },
      { key: 'primary_color', value: '#1976d2', type: 'string', description: '主色调' },
      { key: 'font_size', value: '14', type: 'number', description: '字体大小' },
      { key: 'font_family', value: 'system-ui', type: 'string', description: '字体族' },
      { key: 'auto_save', value: 'true', type: 'boolean', description: '自动保存' },
      { key: 'auto_save_interval', value: '3000', type: 'number', description: '自动保存间隔(ms)' },
      { key: 'window_width', value: '1200', type: 'number', description: '窗口宽度' },
      { key: 'window_height', value: '800', type: 'number', description: '窗口高度' },
      { key: 'window_x', value: 'center', type: 'string', description: '窗口X位置' },
      { key: 'window_y', value: 'center', type: 'string', description: '窗口Y位置' },
      { key: 'show_line_numbers', value: 'true', type: 'boolean', description: '显示行号' },
      { key: 'word_wrap', value: 'true', type: 'boolean', description: '自动换行' },
      { key: 'spell_check', value: 'false', type: 'boolean', description: '拼写检查' },
      { key: 'userAvatar', value: '', type: 'string', description: '用户头像' }
    ];

    const insertSetting = this.db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, type, description) 
      VALUES (?, ?, ?, ?)
    `);

    for (const setting of defaultSettings) {
      insertSetting.run(setting.key, setting.value, setting.type, setting.description);
    }
  }

  /**
   * 插入默认分类
   */
  async insertDefaultCategories() {
    const defaultCategories = [
      { name: 'default', color: '#1976d2', icon: 'folder', sort_order: 0 },
      { name: '工作', color: '#f44336', icon: 'work', sort_order: 1 },
      { name: '学习', color: '#4caf50', icon: 'school', sort_order: 2 },
      { name: '生活', color: '#ff9800', icon: 'home', sort_order: 3 },
      { name: '想法', color: '#9c27b0', icon: 'lightbulb', sort_order: 4 }
    ];

    const insertCategory = this.db.prepare(`
      INSERT OR IGNORE INTO categories (name, color, icon, sort_order) 
      VALUES (?, ?, ?, ?)
    `);

    for (const category of defaultCategories) {
      insertCategory.run(category.name, category.color, category.icon, category.sort_order);
    }
  }

  /**
   * 执行数据库迁移
   */
  async runMigrations() {
    try {
      // 检查todos表是否有tags字段，如果没有则添加
      const tableInfo = this.db.prepare("PRAGMA table_info(todos)").all();
      const hasTagsColumn = tableInfo.some(column => column.name === 'tags');
      
      if (!hasTagsColumn) {
        console.log('添加tags字段到todos表...');
        this.db.exec("ALTER TABLE todos ADD COLUMN tags TEXT DEFAULT ''");
        console.log('todos表迁移完成');
      }
      
      // 检查并添加重复事项相关字段
      const currentTableInfo = this.db.prepare("PRAGMA table_info(todos)").all();
      const columnNames = currentTableInfo.map(col => col.name);
      
      const repeatColumns = [
        { name: 'repeat_type', sql: "ALTER TABLE todos ADD COLUMN repeat_type TEXT DEFAULT 'none'" },
        { name: 'repeat_days', sql: "ALTER TABLE todos ADD COLUMN repeat_days TEXT DEFAULT ''" },
        { name: 'repeat_interval', sql: "ALTER TABLE todos ADD COLUMN repeat_interval INTEGER DEFAULT 1" },
        { name: 'next_due_date', sql: "ALTER TABLE todos ADD COLUMN next_due_date DATETIME NULL" },
        { name: 'is_recurring', sql: "ALTER TABLE todos ADD COLUMN is_recurring INTEGER DEFAULT 0" },
        { name: 'parent_todo_id', sql: "ALTER TABLE todos ADD COLUMN parent_todo_id INTEGER NULL" }
      ];
      
      for (const column of repeatColumns) {
        if (!columnNames.includes(column.name)) {
          console.log(`添加${column.name}字段到todos表...`);
          this.db.exec(column.sql);
        }
      }

      if (!columnNames.includes('focus_time_seconds')) {
        console.log('添加focus_time_seconds字段到todos表...');
        this.db.exec("ALTER TABLE todos ADD COLUMN focus_time_seconds INTEGER DEFAULT 0");
      }

      if (!columnNames.includes('description')) {
        console.log('添加description字段到todos表...');
        this.db.exec("ALTER TABLE todos ADD COLUMN description TEXT DEFAULT ''");
      }

      // ===== 待办事项软删除支持 (2025-11-18) =====
      if (!columnNames.includes('is_deleted')) {
        console.log('添加is_deleted字段到todos表 (软删除支持)...');
        this.db.exec("ALTER TABLE todos ADD COLUMN is_deleted INTEGER DEFAULT 0");
      }

      if (!columnNames.includes('deleted_at')) {
        console.log('添加deleted_at字段到todos表 (软删除时间戳)...');
        this.db.exec("ALTER TABLE todos ADD COLUMN deleted_at DATETIME NULL");
      }
      
      // 添加索引
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_todos_is_deleted ON todos(is_deleted)');
      console.log('待办事项软删除字段迁移完成');

      // ===== 日程/待办区分和时间类型支持 (2025-11-11) =====
      if (!columnNames.includes('item_type')) {
        console.log('添加item_type字段到todos表 (区分日程/待办)...');
        this.db.exec("ALTER TABLE todos ADD COLUMN item_type TEXT DEFAULT 'todo'"); // 'todo' 或 'event'
      }

      if (!columnNames.includes('has_time')) {
        console.log('添加has_time字段到todos表 (区分全天/带时间)...');
        this.db.exec("ALTER TABLE todos ADD COLUMN has_time INTEGER DEFAULT 0"); // 0=全天, 1=带时间
      }

      if (!columnNames.includes('end_date')) {
        console.log('添加end_date字段到todos表 (支持结束时间)...');
        this.db.exec("ALTER TABLE todos ADD COLUMN end_date DATETIME NULL");
      }
      
      // 添加索引
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_todos_item_type ON todos(item_type)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_todos_has_time ON todos(has_time)');
      
      console.log('日程/待办字段迁移完成');

      // ===== 笔记表基础字段检查 (2025-11-14) =====
      // 检查notes表结构
      const notesTableInfo = this.db.prepare("PRAGMA table_info(notes)").all();
      const notesColumnNames = notesTableInfo.map(col => col.name);
      
      console.log('检查notes表字段:', notesColumnNames);
      
      // 检查并添加title字段（兼容旧版本数据库）
      let titleAdded = false;
      if (!notesColumnNames.includes('title')) {
        console.log('添加title字段到notes表 (兼容旧版本)...');
        this.db.exec("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
        titleAdded = true;
        console.log('✅ title字段添加完成');
      }
      
      // 检查FTS5表是否需要重建
      let needRebuildFTS = titleAdded;
      if (!needRebuildFTS) {
        try {
          // 尝试查询FTS表，看是否有title字段
          this.db.prepare('SELECT title FROM notes_fts LIMIT 1').all();
        } catch (error) {
          if (error.message.includes('no such column: title')) {
            console.log('检测到FTS5表缺少title字段，需要重建');
            needRebuildFTS = true;
          }
        }
      }
      
      // 如果需要，重建FTS5表
      if (needRebuildFTS) {
        console.log('重建FTS5全文搜索索引...');
        try {
          // 删除旧的FTS表和触发器
          this.db.exec('DROP TRIGGER IF EXISTS notes_fts_insert');
          this.db.exec('DROP TRIGGER IF EXISTS notes_fts_update');
          this.db.exec('DROP TRIGGER IF EXISTS notes_fts_delete');
          this.db.exec('DROP TABLE IF EXISTS notes_fts');
          
          // 重新创建FTS表
          this.db.exec(`
            CREATE VIRTUAL TABLE notes_fts USING fts5(
              title, 
              content, 
              content=notes, 
              content_rowid=id,
              tokenize='unicode61 remove_diacritics 1'
            )
          `);
          
          // 同步现有数据
          const existingNotes = this.db.prepare('SELECT id, title, content FROM notes').all();
          const insertStmt = this.db.prepare(
            'INSERT INTO notes_fts(rowid, title, content) VALUES (?, ?, ?)'
          );
          
          for (const note of existingNotes) {
            insertStmt.run(note.id, note.title || '', note.content || '');
          }
          
          // 创建同步触发器
          this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
              INSERT INTO notes_fts(rowid, title, content) 
              VALUES (new.id, new.title, new.content);
            END
          `);
          
          this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
              UPDATE notes_fts SET title = new.title, content = new.content 
              WHERE rowid = new.id;
            END
          `);
          
          this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
              DELETE FROM notes_fts WHERE rowid = old.id;
            END
          `);
          
          console.log(`✅ FTS5全文搜索索引重建完成（已同步 ${existingNotes.length} 条笔记）`);
        } catch (ftsError) {
          console.error('重建FTS5索引失败:', ftsError);
        }
      }
      
      // ===== 笔记类型系统 (2025-11-11) =====
      if (!notesColumnNames.includes('note_type')) {
        console.log('添加note_type字段到notes表 (支持Markdown/白板等类型)...');
        this.db.exec("ALTER TABLE notes ADD COLUMN note_type TEXT DEFAULT 'markdown'");
        
        // 迁移现有数据：将 category='whiteboard' 的笔记迁移为 note_type='whiteboard'
        console.log('迁移现有白板笔记...');
        this.db.exec("UPDATE notes SET note_type = 'whiteboard' WHERE category = 'whiteboard'");
        
        // 创建索引
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type)');
        
        console.log('笔记类型字段迁移完成');
      }
      
      // 添加重复事项相关索引
      const repeatIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_todos_repeat_type ON todos(repeat_type)',
        'CREATE INDEX IF NOT EXISTS idx_todos_is_recurring ON todos(is_recurring)',
        'CREATE INDEX IF NOT EXISTS idx_todos_next_due_date ON todos(next_due_date)',
        'CREATE INDEX IF NOT EXISTS idx_todos_parent_todo_id ON todos(parent_todo_id)'
      ];
      
      for (const indexSql of repeatIndexes) {
        this.db.exec(indexSql);
      }
      
      console.log('重复事项字段迁移完成');
      
      // ===== 性能优化索引（2025-11-09 添加）=====
      console.log('创建性能优化索引...');
      
      // 1. 笔记列表查询优化（最常用）
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_list_updated 
        ON notes(is_deleted, updated_at DESC, is_pinned DESC)
      `);
      
      // 2. 置顶笔记快速查询
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_pinned 
        ON notes(is_deleted, is_pinned, updated_at DESC)
      `);
      
      // 3. 已删除笔记查询优化
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_deleted 
        ON notes(is_deleted, deleted_at DESC)
      `);
      
      // 4. 分类筛选优化
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_category 
        ON notes(category, is_deleted, updated_at DESC)
      `);
      
      // 5. 创建时间索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_created 
        ON notes(is_deleted, created_at DESC)
      `);
      
      console.log('✅ 性能索引创建完成');
      
      // 6. FTS5 全文搜索
      try {
        const ftsTables = this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'"
        ).all();
        
        if (ftsTables.length === 0) {
          console.log('创建 FTS5 全文搜索引擎...');
          
          this.db.exec(`
            CREATE VIRTUAL TABLE notes_fts USING fts5(
              title, 
              content, 
              content=notes, 
              content_rowid=id,
              tokenize='unicode61 remove_diacritics 1'
            )
          `);
          
          // 同步现有数据
          const existingNotes = this.db.prepare('SELECT id, title, content FROM notes').all();
          const insertStmt = this.db.prepare(
            'INSERT INTO notes_fts(rowid, title, content) VALUES (?, ?, ?)'
          );
          
          for (const note of existingNotes) {
            insertStmt.run(note.id, note.title || '', note.content || '');
          }
          
          // 创建同步触发器
          this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
              INSERT INTO notes_fts(rowid, title, content) 
              VALUES (new.id, new.title, new.content);
            END
          `);
          
          this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
              UPDATE notes_fts SET title = new.title, content = new.content 
              WHERE rowid = new.id;
            END
          `);
          
          this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
              DELETE FROM notes_fts WHERE rowid = old.id;
            END
          `);
          
          console.log(`✅ FTS5 全文搜索引擎创建完成（已同步 ${existingNotes.length} 条笔记）`);
        } else {
          console.log('FTS5 全文搜索引擎已存在');
        }
      } catch (ftsError) {
        console.warn('FTS5 创建失败（不影响应用）:', ftsError.message);
      }
      
      // 分析表优化查询计划
      this.db.exec('ANALYZE notes');
      console.log('✅ 数据库性能优化完成');
      
    } catch (error) {
      console.error('数据库迁移失败:', error);
      // 不抛出错误，允许应用继续运行
    }
  }

  /**
   * 获取数据库实例
   */
  getDatabase() {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }
    return this.db;
  }

  /**
   * 获取数据库文件路径
   * @returns {string} 数据库文件路径
   */
  getDatabasePath() {
    return this.dbPath;
  }

  /**
   * 执行事务
   */
  transaction(callback) {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }
    return this.db.transaction(callback);
  }

  /**
   * 备份数据库
   */
  async backup(backupPath) {
    try {
      if (!this.db) {
        throw new Error('数据库未初始化');
      }
      
      await this.db.backup(backupPath);
      console.log('数据库备份成功:', backupPath);
      return true;
    } catch (error) {
      console.error('数据库备份失败:', error);
      throw error;
    }
  }

  /**
   * 修复损坏的数据库
   * 处理 SQLITE_CORRUPT_VTAB 等错误
   */
  async repairDatabase() {
    try {
      console.log('🔧 开始修复数据库...');
      
      if (!this.db) {
        throw new Error('数据库未初始化');
      }

      const results = {
        walCheckpoint: false,
        ftsRebuild: false,
        vacuum: false,
        analyze: false
      };

      // 1. 执行 WAL checkpoint
      try {
        console.log('  🔄 执行 WAL checkpoint...');
        this.db.pragma('wal_checkpoint(TRUNCATE)');
        results.walCheckpoint = true;
        console.log('  ✅ WAL checkpoint 完成');
      } catch (error) {
        console.error('  ⚠️  WAL checkpoint 失败:', error.message);
      }

      // 2. 重建 FTS5 虚拟表
      try {
        console.log('  🔨 重建 FTS5 虚拟表...');
        
        const ftsExists = this.db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='notes_fts'
        `).get();

        if (ftsExists) {
          this.db.exec('DROP TABLE IF EXISTS notes_fts');
          
          this.db.exec(`
            CREATE VIRTUAL TABLE notes_fts USING fts5(
              content,
              content='notes',
              content_rowid='id',
              tokenize='porter unicode61'
            )`);
          
          this.db.exec('INSERT INTO notes_fts(notes_fts) VALUES(\'rebuild\')');
          
          results.ftsRebuild = true;
          console.log('  ✅ FTS5 表重建完成');
        }
      } catch (error) {
        console.error('  ⚠️  FTS5 重建失败:', error.message);
      }

      // 3. 优化数据库
      try {
        console.log('  ⚡ 执行 VACUUM...');
        this.db.exec('VACUUM');
        results.vacuum = true;
        console.log('  ✅ VACUUM 完成');
      } catch (error) {
        console.error('  ⚠️  VACUUM 失败:', error.message);
      }

      // 4. 分析数据库
      try {
        console.log('  📊 执行 ANALYZE...');
        this.db.exec('ANALYZE');
        results.analyze = true;
        console.log('  ✅ ANALYZE 完成');
      } catch (error) {
        console.error('  ⚠️  ANALYZE 失败:', error.message);
      }

      console.log('✅ 数据库修复完成');
      return { success: true, results };
      
    } catch (error) {
      console.error('❌ 数据库修复失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('数据库连接已关闭');
    }
  }

  /**
   * 获取数据库信息
   */
  getInfo() {
    if (!this.db) {
      return null;
    }
    
    return {
      path: this.dbPath,
      inTransaction: this.db.inTransaction,
      open: this.db.open,
      readonly: this.db.readonly
    };
  }
}

// 单例模式
let instance = null;

module.exports = {
  getInstance() {
    if (!instance) {
      instance = new DatabaseManager();
    }
    return instance;
  },
  DatabaseManager
};