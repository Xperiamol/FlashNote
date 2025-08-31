const { getInstance } = require('./DatabaseManager');

class TodoDAO {
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
   * 创建新待办事项
   */
  create(todoData) {
    const db = this.getDB();
    const { 
      content, 
      tags = '',
      is_important = 0, 
      is_urgent = 0, 
      due_date = null 
    } = todoData;
    
    const stmt = db.prepare(`
      INSERT INTO todos (content, tags, is_important, is_urgent, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    const result = stmt.run(content, tags, is_important, is_urgent, due_date);
    return this.findById(result.lastInsertRowid);
  }

  /**
   * 根据ID查找待办事项
   */
  findById(id) {
    const db = this.getDB();
    const stmt = db.prepare('SELECT * FROM todos WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * 更新待办事项
   */
  update(id, todoData) {
    const db = this.getDB();
    const { 
      content, 
      tags,
      is_completed, 
      is_important, 
      is_urgent, 
      due_date 
    } = todoData;
    
    let updateFields = [];
    let params = [];
    
    if (content !== undefined) {
      updateFields.push('content = ?');
      params.push(content);
    }
    
    if (tags !== undefined) {
      updateFields.push('tags = ?');
      params.push(tags);
    }
    
    if (is_completed !== undefined) {
      updateFields.push('is_completed = ?');
      params.push(is_completed);
      
      // 如果标记为完成，设置完成时间
      if (is_completed) {
        updateFields.push('completed_at = CURRENT_TIMESTAMP');
      } else {
        updateFields.push('completed_at = NULL');
      }
    }
    
    if (is_important !== undefined) {
      updateFields.push('is_important = ?');
      params.push(is_important);
    }
    
    if (is_urgent !== undefined) {
      updateFields.push('is_urgent = ?');
      params.push(is_urgent);
    }
    
    if (due_date !== undefined) {
      updateFields.push('due_date = ?');
      params.push(due_date);
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    const stmt = db.prepare(`
      UPDATE todos 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `);
    
    const result = stmt.run(...params);
    return result.changes > 0 ? this.findById(id) : null;
  }

  /**
   * 删除待办事项
   */
  delete(id) {
    const db = this.getDB();
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    return stmt.run(id).changes > 0;
  }

  /**
   * 获取所有待办事项
   */
  findAll(options = {}) {
    const db = this.getDB();
    const {
      includeCompleted = true,
      sortBy = 'quadrant', // 'quadrant', 'due_date', 'created_at'
      sortOrder = 'ASC'
    } = options;
    
    let whereConditions = [];
    let params = [];
    
    if (!includeCompleted) {
      whereConditions.push('is_completed = 0');
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    let orderClause = '';
    if (sortBy === 'quadrant') {
      // 四象限排序：重要且紧急 > 重要不紧急 > 不重要紧急 > 不重要不紧急
      orderClause = `ORDER BY 
        (is_important * 2 + is_urgent) DESC,
        CASE 
          WHEN due_date IS NOT NULL THEN due_date 
          ELSE '9999-12-31 23:59:59'
        END ASC,
        created_at ASC`;
    } else if (sortBy === 'due_date') {
      orderClause = `ORDER BY 
        CASE 
          WHEN due_date IS NOT NULL THEN due_date 
          ELSE '9999-12-31 23:59:59'
        END ${sortOrder},
        created_at ASC`;
    } else {
      orderClause = `ORDER BY ${sortBy} ${sortOrder}`;
    }
    
    const stmt = db.prepare(`
      SELECT * FROM todos 
      ${whereClause}
      ${orderClause}
    `);
    
    return stmt.all(...params);
  }

  /**
   * 按四象限分组获取待办事项
   */
  findByQuadrant(includeCompleted = false) {
    const todos = this.findAll({ includeCompleted, sortBy: 'quadrant' });
    
    const quadrants = {
      urgent_important: [], // 重要且紧急
      not_urgent_important: [], // 重要不紧急
      urgent_not_important: [], // 紧急不重要
      not_urgent_not_important: [] // 不重要不紧急
    };
    
    todos.forEach(todo => {
      if (todo.is_important && todo.is_urgent) {
        quadrants.urgent_important.push(todo);
      } else if (todo.is_important && !todo.is_urgent) {
        quadrants.not_urgent_important.push(todo);
      } else if (!todo.is_important && todo.is_urgent) {
        quadrants.urgent_not_important.push(todo);
      } else {
        quadrants.not_urgent_not_important.push(todo);
      }
    });
    
    return quadrants;
  }

  /**
   * 获取今日到期的待办事项
   */
  findDueToday() {
    const db = this.getDB();
    const today = new Date().toISOString().split('T')[0];
    
    const stmt = db.prepare(`
      SELECT * FROM todos 
      WHERE is_completed = 0 
        AND date(due_date) = date(?)
      ORDER BY due_date ASC
    `);
    
    return stmt.all(today);
  }

  /**
   * 获取逾期的待办事项
   */
  findOverdue() {
    const db = this.getDB();
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      SELECT * FROM todos 
      WHERE is_completed = 0 
        AND due_date < ?
      ORDER BY due_date ASC
    `);
    
    return stmt.all(now);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const db = this.getDB();
    
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM todos');
    const completedStmt = db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_completed = 1');
    const pendingStmt = db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_completed = 0');
    const overdueStmt = db.prepare(`
      SELECT COUNT(*) as count FROM todos 
      WHERE is_completed = 0 AND due_date < datetime('now')
    `);
    
    return {
      total: totalStmt.get().count,
      completed: completedStmt.get().count,
      pending: pendingStmt.get().count,
      overdue: overdueStmt.get().count
    };
  }

  /**
   * 获取优先级统计
   */
  getPriorityStats() {
    const db = this.getDB();
    
    const urgentStmt = db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_important = 1 AND is_urgent = 1 AND is_completed = 0');
    const importantStmt = db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_important = 1 AND is_urgent = 0 AND is_completed = 0');
    const normalStmt = db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_important = 0 AND is_urgent = 1 AND is_completed = 0');
    const lowStmt = db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_important = 0 AND is_urgent = 0 AND is_completed = 0');
    
    return {
      urgent: urgentStmt.get().count,
      important: importantStmt.get().count,
      normal: normalStmt.get().count,
      low: lowStmt.get().count
    };
  }

  /**
   * 批量更新待办事项
   */
  batchUpdate(updates) {
    const db = this.getDB();
    const transaction = db.transaction(() => {
      updates.forEach(({ id, ...data }) => {
        this.update(id, data);
      });
    });
    
    return transaction();
  }

  /**
   * 批量删除待办事项
   */
  batchDelete(ids) {
    const db = this.getDB();
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`DELETE FROM todos WHERE id IN (${placeholders})`);
    return stmt.run(...ids).changes;
  }

  /**
   * 批量完成待办事项
   */
  batchComplete(ids) {
    const db = this.getDB();
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE todos SET is_completed = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`);
    return stmt.run(...ids).changes;
  }

  /**
   * 搜索待办事项
   */
  search(query) {
    const db = this.getDB();
    const stmt = db.prepare(`
      SELECT *, 
        CASE 
          WHEN is_important = 1 AND is_urgent = 1 THEN 'urgent'
          WHEN is_important = 1 AND is_urgent = 0 THEN 'important'
          WHEN is_important = 0 AND is_urgent = 1 THEN 'normal'
          ELSE 'low'
        END as priority,
        CASE 
          WHEN is_important = 1 AND is_urgent = 1 THEN 'urgent'
          WHEN is_important = 1 AND is_urgent = 0 THEN 'important'
          WHEN is_important = 0 AND is_urgent = 1 THEN 'normal'
          ELSE 'low'
        END as title
      FROM todos 
      WHERE content LIKE ? 
      ORDER BY created_at DESC
    `);
    return stmt.all(`%${query}%`);
  }

  /**
   * 按优先级排序获取待办事项
   */
  findByPriority() {
    const db = this.getDB();
    const stmt = db.prepare(`
      SELECT *, 
        CASE 
          WHEN is_important = 1 AND is_urgent = 1 THEN 'urgent'
          WHEN is_important = 1 AND is_urgent = 0 THEN 'important'
          WHEN is_important = 0 AND is_urgent = 1 THEN 'normal'
          ELSE 'low'
        END as priority,
        content as title
      FROM todos 
      ORDER BY 
        CASE 
          WHEN is_important = 1 AND is_urgent = 1 THEN 1
          WHEN is_important = 1 AND is_urgent = 0 THEN 2
          WHEN is_important = 0 AND is_urgent = 1 THEN 3
          ELSE 4
        END,
        created_at DESC
    `);
    return stmt.all();
  }

  /**
   * 按截止时间排序获取待办事项
   */
  findByDueDate() {
    const db = this.getDB();
    const stmt = db.prepare(`
      SELECT *, 
        CASE 
          WHEN is_important = 1 AND is_urgent = 1 THEN 'urgent'
          WHEN is_important = 1 AND is_urgent = 0 THEN 'important'
          WHEN is_important = 0 AND is_urgent = 1 THEN 'normal'
          ELSE 'low'
        END as priority,
        content as title
      FROM todos 
      ORDER BY 
        CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
        due_date ASC,
        created_at DESC
    `);
    return stmt.all();
  }

  /**
   * 按创建时间排序获取待办事项
   */
  findByCreatedAt() {
    const db = this.getDB();
    const stmt = db.prepare(`
      SELECT *, 
        CASE 
          WHEN is_important = 1 AND is_urgent = 1 THEN 'urgent'
          WHEN is_important = 1 AND is_urgent = 0 THEN 'important'
          WHEN is_important = 0 AND is_urgent = 1 THEN 'normal'
          ELSE 'low'
        END as priority,
        content as title
      FROM todos 
      ORDER BY created_at DESC
    `);
    return stmt.all();
  }

  /**
   * 获取待办事项标签统计
   */
  getTodoTagStats() {
    const db = this.getDB();
    const stmt = db.prepare(`
      SELECT tags FROM todos 
      WHERE tags IS NOT NULL AND tags != ''
    `);
    
    const todos = stmt.all();
    const tagCounts = {};
    
    todos.forEach(todo => {
      if (todo.tags) {
        // 解析标签字符串，支持逗号分隔和空格分隔
        const tags = todo.tags.split(/[,\s]+/).filter(tag => tag.trim());
        tags.forEach(tag => {
          const cleanTag = tag.trim();
          if (cleanTag) {
            tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
          }
        });
      }
    });
    
    // 转换为数组格式，按使用次数排序
    return Object.entries(tagCounts)
      .map(([name, usage_count]) => ({ name, usage_count }))
      .sort((a, b) => b.usage_count - a.usage_count);
  }
}

module.exports = TodoDAO;