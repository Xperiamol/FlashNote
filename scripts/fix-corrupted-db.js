/**
 * 修复损坏的数据库
 * 处理 SQLITE_CORRUPT_VTAB 错误
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 数据库路径
const prodDbPath = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming'),
  'flashnote',
  'database',
  'flashnote.db'
);

console.log('🔧 开始修复数据库...\n');
console.log('数据库路径:', prodDbPath);

if (!fs.existsSync(prodDbPath)) {
  console.error('❌ 数据库文件不存在');
  process.exit(1);
}

try {
  // 1. 创建备份
  const timestamp = Date.now();
  const backupPath = `${prodDbPath}.backup.${timestamp}`;
  fs.copyFileSync(prodDbPath, backupPath);
  console.log('✅ 已创建备份:', backupPath);

  // 2. 打开数据库
  console.log('\n📂 打开数据库...');
  const db = new Database(prodDbPath);

  // 3. 执行 WAL checkpoint，将 WAL 文件内容合并到主数据库
  console.log('🔄 执行 WAL checkpoint...');
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('✅ WAL checkpoint 完成');
  } catch (error) {
    console.error('⚠️  WAL checkpoint 失败:', error.message);
  }

  // 4. 检查完整性
  console.log('\n🔍 检查数据库完整性...');
  try {
    const integrityCheck = db.pragma('integrity_check');
    if (integrityCheck[0].integrity_check === 'ok') {
      console.log('✅ 数据库完整性检查通过');
    } else {
      console.log('⚠️  发现完整性问题:', integrityCheck);
    }
  } catch (error) {
    console.error('❌ 完整性检查失败:', error.message);
  }

  // 5. 尝试重建 FTS5 表（如果存在问题）
  console.log('\n🔨 重建 FTS5 虚拟表...');
  try {
    // 检查 FTS5 表是否存在
    const ftsExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='notes_fts'
    `).get();

    if (ftsExists) {
      console.log('  - 删除旧的 FTS5 表...');
      db.exec('DROP TABLE IF EXISTS notes_fts');
      
      console.log('  - 重新创建 FTS5 表...');
      db.exec(`
        CREATE VIRTUAL TABLE notes_fts USING fts5(
          content,
          content='notes',
          content_rowid='id',
          tokenize='porter unicode61'
        )
      `);
      
      console.log('  - 重建 FTS5 索引...');
      db.exec('INSERT INTO notes_fts(notes_fts) VALUES(\'rebuild\')');
      
      console.log('✅ FTS5 表重建完成');
    } else {
      console.log('  ℹ️  FTS5 表不存在，跳过');
    }
  } catch (error) {
    console.error('⚠️  FTS5 重建失败:', error.message);
  }

  // 6. 优化数据库
  console.log('\n⚡ 优化数据库...');
  try {
    db.exec('VACUUM');
    console.log('✅ VACUUM 完成');
  } catch (error) {
    console.error('⚠️  VACUUM 失败:', error.message);
  }

  // 7. 分析数据库
  try {
    db.exec('ANALYZE');
    console.log('✅ ANALYZE 完成');
  } catch (error) {
    console.error('⚠️  ANALYZE 失败:', error.message);
  }

  // 8. 显示数据库信息
  console.log('\n📊 数据库信息:');
  try {
    const noteCount = db.prepare('SELECT COUNT(*) as count FROM notes WHERE is_deleted = 0').get();
    const todoCount = db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0').get();
    console.log('  - 笔记数量:', noteCount.count);
    console.log('  - 待办数量:', todoCount.count);
  } catch (error) {
    console.error('⚠️  无法获取数据统计:', error.message);
  }

  db.close();
  console.log('\n✅ 数据库修复完成！');

} catch (error) {
  console.error('\n❌ 修复失败:', error.message);
  console.error(error);
  process.exit(1);
}
