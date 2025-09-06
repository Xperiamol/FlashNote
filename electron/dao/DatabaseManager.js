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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL
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
      'CREATE INDEX IF NOT EXISTS idx_todos_is_urgent ON todos(is_urgent)'
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