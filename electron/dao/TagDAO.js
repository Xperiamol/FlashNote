const { getInstance } = require('./DatabaseManager');

/**
 * 标签数据访问对象
 * 遵循SOLID原则中的单一职责原则，专门处理标签相关的数据库操作
 */
class TagDAO {
  constructor() {
    this.dbManager = getInstance();
  }

  /**
   * 获取数据库实例
   */
  getDB() {
    return this.dbManager.getDatabase();
  }

  /**
   * 创建或更新标签使用次数
   * @param {string[]} tagNames - 标签名称数组
   */
  updateTagsUsage(tagNames) {
    if (!tagNames || tagNames.length === 0) return;
    
    const db = this.getDB();
    const transaction = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO tags (name, usage_count) 
        VALUES (?, 1)
      `);
      
      const updateStmt = db.prepare(`
        UPDATE tags 
        SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE name = ?
      `);
      
      for (const tagName of tagNames) {
        if (tagName && tagName.trim()) {
          const cleanTagName = tagName.trim();
          insertStmt.run(cleanTagName);
          updateStmt.run(cleanTagName);
        }
      }
    });
    
    transaction();
  }

  /**
   * 减少标签使用次数
   * @param {string[]} tagNames - 标签名称数组
   */
  decreaseTagsUsage(tagNames) {
    if (!tagNames || tagNames.length === 0) return;
    
    const db = this.getDB();
    const transaction = db.transaction(() => {
      const updateStmt = db.prepare(`
        UPDATE tags 
        SET usage_count = MAX(0, usage_count - 1), updated_at = CURRENT_TIMESTAMP
        WHERE name = ?
      `);
      
      const deleteStmt = db.prepare(`
        DELETE FROM tags 
        WHERE name = ? AND usage_count = 0
      `);
      
      for (const tagName of tagNames) {
        if (tagName && tagName.trim()) {
          const cleanTagName = tagName.trim();
          updateStmt.run(cleanTagName);
          deleteStmt.run(cleanTagName);
        }
      }
    });
    
    transaction();
  }

  /**
   * 获取所有标签
   * @param {Object} options - 查询选项
   * @param {number} options.limit - 限制数量
   * @param {string} options.orderBy - 排序方式 ('usage_count' | 'name' | 'updated_at')
   * @param {string} options.order - 排序顺序 ('ASC' | 'DESC')
   * @returns {Array} 标签列表
   */
  findAll(options = {}) {
    const { limit = 100, orderBy = 'usage_count', order = 'DESC' } = options;
    
    const validOrderBy = ['usage_count', 'name', 'updated_at'].includes(orderBy) ? orderBy : 'usage_count';
    const validOrder = ['ASC', 'DESC'].includes(order) ? order : 'DESC';
    
    const db = this.getDB();
    const stmt = db.prepare(`
      SELECT * FROM tags 
      ORDER BY ${validOrderBy} ${validOrder}
      LIMIT ?
    `);
    
    return stmt.all(limit);
  }

  /**
   * 根据名称搜索标签
   * @param {string} query - 搜索查询
   * @param {number} limit - 限制数量
   * @returns {Array} 匹配的标签列表
   */
  searchByName(query, limit = 20) {
    if (!query || !query.trim()) {
      return this.findAll({ limit });
    }
    
    const db = this.getDB();
    const stmt = db.prepare(`
      SELECT * FROM tags 
      WHERE name LIKE ?
      ORDER BY usage_count DESC, name ASC
      LIMIT ?
    `);
    
    return stmt.all(`%${query.trim()}%`, limit);
  }

  /**
   * 获取标签统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const db = this.getDB();
    
    const totalStmt = db.prepare('SELECT COUNT(*) as total FROM tags');
    const usedStmt = db.prepare('SELECT COUNT(*) as used FROM tags WHERE usage_count > 0');
    const topUsedStmt = db.prepare(`
      SELECT name, usage_count FROM tags 
      WHERE usage_count > 0
      ORDER BY usage_count DESC 
      LIMIT 10
    `);
    
    return {
      total: totalStmt.get().total,
      used: usedStmt.get().used,
      topUsed: topUsedStmt.all()
    };
  }

  /**
   * 清理未使用的标签
   * @returns {number} 清理的标签数量
   */
  cleanupUnusedTags() {
    const db = this.getDB();
    const stmt = db.prepare('DELETE FROM tags WHERE usage_count = 0');
    const result = stmt.run();
    return result.changes;
  }

  /**
   * 根据名称删除标签
   * @param {string} tagName - 标签名称
   * @returns {boolean} 是否删除成功
   */
  deleteByName(tagName) {
    if (!tagName || !tagName.trim()) return false;
    
    const db = this.getDB();
    const stmt = db.prepare('DELETE FROM tags WHERE name = ?');
    const result = stmt.run(tagName.trim());
    return result.changes > 0;
  }

  /**
   * 重新计算所有标签的使用次数
   * 基于实际存在的笔记重新统计标签使用次数
   * @returns {number} 更新的标签数量
   */
  recalculateTagUsage() {
    const db = this.getDB();
    
    const transaction = db.transaction(() => {
      // 1. 重置所有标签的使用次数为0
      const resetStmt = db.prepare('UPDATE tags SET usage_count = 0');
      resetStmt.run();
      
      // 2. 从所有未删除的笔记中统计标签使用次数
      const notesStmt = db.prepare("SELECT tags FROM notes WHERE is_deleted = 0 AND tags IS NOT NULL AND tags != ''");
      const notes = notesStmt.all();
      
      const tagCounts = new Map();
      
      // 统计每个标签的使用次数
      for (const note of notes) {
        if (note.tags) {
          const tags = note.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
          for (const tag of tags) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          }
        }
      }
      
      // 3. 更新标签表中的使用次数
      const updateStmt = db.prepare('UPDATE tags SET usage_count = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?');
      const insertStmt = db.prepare('INSERT OR IGNORE INTO tags (name, usage_count, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
      
      let updatedCount = 0;
      for (const [tagName, count] of tagCounts) {
        // 先尝试插入（如果标签不存在）
        insertStmt.run(tagName, count);
        // 然后更新使用次数
        const result = updateStmt.run(count, tagName);
        if (result.changes > 0) {
          updatedCount++;
        }
      }
      
      // 4. 删除使用次数为0的标签
      const deleteStmt = db.prepare('DELETE FROM tags WHERE usage_count = 0');
      deleteStmt.run();
      
      return updatedCount;
    });
    
    return transaction();
  }
}

module.exports = TagDAO;