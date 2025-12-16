/**
 * FlashNote 数据库修复工具
 *
 * 用于检查和修复损坏的 SQLite 数据库
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// 数据库路径（默认）
const USER_DATA = process.env.APPDATA ||
  (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const DB_PATH = path.join(USER_DATA, 'FlashNote', 'flashnote.db');

console.log('='.repeat(60));
console.log('FlashNote 数据库修复工具');
console.log('='.repeat(60));
console.log('数据库路径:', DB_PATH);
console.log('');

// 检查数据库是否存在
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ 数据库文件不存在:', DB_PATH);
  process.exit(1);
}

// 创建备份
function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = DB_PATH + `.backup-${timestamp}`;

  console.log('📦 创建备份...');
  fs.copyFileSync(DB_PATH, backupPath);
  console.log('✅ 备份完成:', backupPath);
  console.log('');

  return backupPath;
}

// 检查数据库完整性
function checkIntegrity() {
  console.log('🔍 检查数据库完整性...');

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // PRAGMA integrity_check
    const result = db.prepare('PRAGMA integrity_check').all();

    if (result.length === 1 && result[0].integrity_check === 'ok') {
      console.log('✅ 数据库完整性检查通过');
      db.close();
      return true;
    } else {
      console.log('❌ 数据库完整性检查失败:');
      result.forEach(row => {
        console.log('  -', row.integrity_check);
      });
      db.close();
      return false;
    }
  } catch (error) {
    console.log('❌ 无法打开数据库:', error.message);
    return false;
  }
}

// 尝试导出数据
function exportData() {
  console.log('');
  console.log('📤 尝试导出数据...');

  try {
    const db = new Database(DB_PATH, { readonly: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const exportPath = path.join(path.dirname(DB_PATH), `export-${timestamp}.json`);

    const data = {
      notes: [],
      todos: [],
      settings: []
    };

    // 导出笔记
    try {
      data.notes = db.prepare('SELECT * FROM notes').all();
      console.log(`  ✅ 导出 ${data.notes.length} 条笔记`);
    } catch (error) {
      console.log(`  ⚠️  笔记表读取失败: ${error.message}`);
    }

    // 导出待办
    try {
      data.todos = db.prepare('SELECT * FROM todos').all();
      console.log(`  ✅ 导出 ${data.todos.length} 条待办`);
    } catch (error) {
      console.log(`  ⚠️  待办表读取失败: ${error.message}`);
    }

    // 导出设置
    try {
      data.settings = db.prepare('SELECT * FROM settings').all();
      console.log(`  ✅ 导出 ${data.settings.length} 条设置`);
    } catch (error) {
      console.log(`  ⚠️  设置表读取失败: ${error.message}`);
    }

    db.close();

    // 写入文件
    fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('✅ 数据已导出到:', exportPath);
    console.log('');

    return { success: true, exportPath, data };
  } catch (error) {
    console.log('❌ 导出失败:', error.message);
    return { success: false };
  }
}

// 重建数据库
function rebuildDatabase(exportedData) {
  console.log('🔨 重建数据库...');

  try {
    // 删除旧数据库
    const oldDbPath = DB_PATH + '.corrupted';
    fs.renameSync(DB_PATH, oldDbPath);
    console.log('  ✅ 旧数据库已重命名为:', oldDbPath);

    // 创建新数据库
    const db = new Database(DB_PATH);

    // 创建表结构
    console.log('  📝 创建表结构...');

    // Notes 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_id TEXT UNIQUE,
        title TEXT NOT NULL,
        content TEXT,
        note_type TEXT DEFAULT 'markdown',
        tags TEXT,
        category TEXT,
        is_pinned INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        whiteboard_data TEXT,
        image_files TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notes_sync_id ON notes(sync_id);
      CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    `);
    console.log('    ✅ notes 表');

    // Todos 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_id TEXT UNIQUE,
        content TEXT NOT NULL,
        is_completed INTEGER DEFAULT 0,
        due_date TEXT,
        priority INTEGER DEFAULT 0,
        category TEXT,
        focus_time INTEGER DEFAULT 0,
        repeat_type TEXT,
        is_recurring INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_todos_sync_id ON todos(sync_id);
      CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(is_completed);
      CREATE INDEX IF NOT EXISTS idx_todos_deleted ON todos(is_deleted);
    `);
    console.log('    ✅ todos 表');

    // Settings 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        type TEXT DEFAULT 'string'
      );
    `);
    console.log('    ✅ settings 表');

    // Change Log 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS change_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        operation TEXT NOT NULL,
        old_data TEXT,
        new_data TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_change_logs_timestamp ON change_logs(timestamp DESC);
    `);
    console.log('    ✅ change_logs 表');

    // 导入数据
    if (exportedData && exportedData.data) {
      console.log('  📥 导入数据...');

      const { notes, todos, settings } = exportedData.data;

      // 导入笔记
      if (notes && notes.length > 0) {
        const insertNote = db.prepare(`
          INSERT INTO notes (id, sync_id, title, content, note_type, tags, category,
                           is_pinned, is_favorite, is_deleted, deleted_at,
                           created_at, updated_at, whiteboard_data, image_files)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((notes) => {
          for (const note of notes) {
            insertNote.run(
              note.id, note.sync_id, note.title, note.content, note.note_type,
              note.tags, note.category, note.is_pinned, note.is_favorite,
              note.is_deleted, note.deleted_at, note.created_at, note.updated_at,
              note.whiteboard_data, note.image_files
            );
          }
        });

        insertMany(notes);
        console.log(`    ✅ 导入 ${notes.length} 条笔记`);
      }

      // 导入待办
      if (todos && todos.length > 0) {
        const insertTodo = db.prepare(`
          INSERT INTO todos (id, sync_id, content, is_completed, due_date, priority,
                           category, focus_time, repeat_type, is_recurring,
                           is_deleted, deleted_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((todos) => {
          for (const todo of todos) {
            insertTodo.run(
              todo.id, todo.sync_id, todo.content, todo.is_completed, todo.due_date,
              todo.priority, todo.category, todo.focus_time, todo.repeat_type,
              todo.is_recurring, todo.is_deleted, todo.deleted_at,
              todo.created_at, todo.updated_at
            );
          }
        });

        insertMany(todos);
        console.log(`    ✅ 导入 ${todos.length} 条待办`);
      }

      // 导入设置
      if (settings && settings.length > 0) {
        const insertSetting = db.prepare(`
          INSERT INTO settings (key, value, type) VALUES (?, ?, ?)
        `);

        const insertMany = db.transaction((settings) => {
          for (const setting of settings) {
            insertSetting.run(setting.key, setting.value, setting.type);
          }
        });

        insertMany(settings);
        console.log(`    ✅ 导入 ${settings.length} 条设置`);
      }
    }

    db.close();
    console.log('✅ 数据库重建完成！');
    console.log('');

    return true;
  } catch (error) {
    console.log('❌ 重建失败:', error.message);
    console.log(error.stack);
    return false;
  }
}

// 主流程
async function main() {
  // 1. 创建备份
  const backupPath = createBackup();

  // 2. 检查完整性
  const isHealthy = checkIntegrity();

  if (isHealthy) {
    console.log('');
    console.log('✅ 数据库健康，无需修复');
    console.log('');
    return;
  }

  // 3. 导出数据
  const exportResult = exportData();

  if (!exportResult.success) {
    console.log('');
    console.log('❌ 无法导出数据，修复失败');
    console.log('建议：');
    console.log('  1. 使用备份恢复:', backupPath);
    console.log('  2. 或删除数据库文件，让应用重新创建');
    console.log('');
    return;
  }

  // 4. 询问是否重建
  console.log('⚠️  数据库已损坏，需要重建');
  console.log('');
  console.log('选项：');
  console.log('  1. 自动重建（推荐）');
  console.log('  2. 手动处理（使用导出的数据）');
  console.log('');

  // 直接执行自动重建（因为是修复脚本）
  const rebuilt = rebuildDatabase(exportResult);

  if (rebuilt) {
    console.log('🎉 修复完成！');
    console.log('');
    console.log('文件保存位置：');
    console.log('  - 原数据库备份:', backupPath);
    console.log('  - 数据导出文件:', exportResult.exportPath);
    console.log('  - 损坏数据库:', DB_PATH + '.corrupted');
    console.log('  - 新数据库:', DB_PATH);
    console.log('');
    console.log('✅ 现在可以重新启动 FlashNote 了');
  } else {
    console.log('');
    console.log('❌ 修复失败');
    console.log('');
    console.log('手动恢复步骤：');
    console.log('  1. 删除损坏的数据库:', DB_PATH);
    console.log('  2. 从备份恢复:', backupPath);
    console.log('  3. 或使用导出的数据手动重建:', exportResult.exportPath);
    console.log('');
  }
}

// 执行
main().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
