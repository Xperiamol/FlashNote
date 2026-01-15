const TodoDAO = require('../dao/TodoDAO');
const TagService = require('./TagService');
const RepeatUtils = require('../utils/repeatUtils');
const TimeZoneUtils = require('../utils/timeZoneUtils');
const EventEmitter = require('events');

// 尝试加载 Electron IPC，如果失败则使用 mock（独立运行模式）
let ipcMain = null;
try {
  const electron = require('electron');
  ipcMain = electron.ipcMain;
} catch (e) {
  // 独立运行模式（如 MCP Server），使用 mock
  ipcMain = {
    handle: () => {},
    on: () => {},
    removeHandler: () => {}
  };
}

class TodoService extends EventEmitter {
  constructor() {
    super();
    this.todoDAO = new TodoDAO();
    this.tagService = new TagService();
    this.notificationService = null; // 将在主进程中设置
    this.setupIpcHandlers();
  }

  /**
   * 设置通知服务
   * @param {NotificationService} notificationService - 通知服务实例
   */
  setNotificationService(notificationService) {
    this.notificationService = notificationService;
    
    // 监听通知服务的检查事件
    if (this.notificationService) {
      this.notificationService.on('check-due-todos', () => {
        this.checkAndNotifyDueTodos();
      });
      
      this.notificationService.on('notification-clicked', (todo) => {
        // 通知被点击时的处理
        this.emit('notification-clicked', todo);
      });
    }
  }

  /**
   * 设置IPC处理器
   */
  setupIpcHandlers() {
    // 创建待办事项
    ipcMain.handle('todo:create', async (event, todoData) => {
      try {
        const todo = this.createTodo(todoData);
        this.emit('todo-created', todo);
        return { success: true, data: todo };
      } catch (error) {
        console.error('创建待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取所有待办事项
    ipcMain.handle('todo:getAll', async (event, options) => {
      try {
        const todos = this.getAllTodos(options);
        return { success: true, data: todos };
      } catch (error) {
        console.error('获取待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 按四象限获取待办事项
    ipcMain.handle('todo:getByQuadrant', async (event, includeCompleted) => {
      try {
        const quadrants = this.getTodosByQuadrant(includeCompleted);
        return { success: true, data: quadrants };
      } catch (error) {
        console.error('按四象限获取待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 更新待办事项
    ipcMain.handle('todo:update', async (event, id, todoData) => {
      try {
        const todo = this.updateTodo(id, todoData);
        this.emit('todo-updated', todo);
        return { success: true, data: todo };
      } catch (error) {
        console.error('更新待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 删除待办事项
    ipcMain.handle('todo:delete', async (event, id) => {
      try {
        const success = this.deleteTodo(id);
        if (success) {
          this.emit('todo-deleted', id);
        }
        return { success, data: success };
      } catch (error) {
        console.error('删除待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 切换完成状态
    ipcMain.handle('todo:toggleComplete', async (event, id) => {
      try {
        const todo = this.toggleTodoComplete(id);
        this.emit('todo-updated', todo);
        return { success: true, data: todo };
      } catch (error) {
        console.error('切换待办事项状态失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 累加专注时长
    ipcMain.handle('todo:addFocusTime', async (event, id, durationSeconds) => {
      try {
        const todo = this.addFocusTime(id, durationSeconds);
        this.emit('todo-updated', todo);
        return { success: true, data: todo };
      } catch (error) {
        console.error('更新待办事项专注时长失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取统计信息
    ipcMain.handle('todo:getStats', async (event) => {
      try {
        const stats = this.getTodoStats();
        return { success: true, data: stats };
      } catch (error) {
        console.error('获取待办事项统计失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取今日到期
    ipcMain.handle('todo:getDueToday', async (event) => {
      try {
        const todos = this.getTodosDueToday();
        return { success: true, data: todos };
      } catch (error) {
        console.error('获取今日到期待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取指定日期的待办事项
    ipcMain.handle('todo:getByDate', async (event, dateString) => {
      try {
        const todos = this.getTodosByDate(dateString);
        return { success: true, data: todos };
      } catch (error) {
        console.error('获取指定日期待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取逾期待办事项
    ipcMain.handle('todo:getOverdue', async (event) => {
      try {
        const todos = this.getOverdueTodos();
        return { success: true, data: todos };
      } catch (error) {
        console.error('获取逾期待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 搜索待办事项
    ipcMain.handle('todo:search', async (event, query) => {
      try {
        const todos = this.searchTodos(query);
        return { success: true, data: todos };
      } catch (error) {
        console.error('搜索待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 按优先级排序获取待办事项
    ipcMain.handle('todo:getByPriority', async (event) => {
      try {
        const todos = this.getTodosByPriority();
        return { success: true, data: todos };
      } catch (error) {
        console.error('按优先级获取待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 按截止时间排序获取待办事项
    ipcMain.handle('todo:getByDueDate', async (event) => {
      try {
        const todos = this.getTodosByDueDate();
        return { success: true, data: todos };
      } catch (error) {
        console.error('按截止时间获取待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 按创建时间排序获取待办事项
    ipcMain.handle('todo:getByCreatedAt', async (event) => {
      try {
        const todos = this.getTodosByCreatedAt();
        return { success: true, data: todos };
      } catch (error) {
        console.error('按创建时间获取待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 批量操作
    ipcMain.handle('todo:batchUpdate', async (event, updates) => {
      try {
        this.batchUpdateTodos(updates);
        this.emit('todos-batch-updated', updates);
        return { success: true };
      } catch (error) {
        console.error('批量更新待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('todo:batchDelete', async (event, ids) => {
      try {
        const count = this.batchDeleteTodos(ids);
        this.emit('todos-batch-deleted', ids);
        return { success: true, data: count };
      } catch (error) {
        console.error('批量删除待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('todo:batchComplete', async (event, ids) => {
      try {
        const count = this.batchCompleteTodos(ids);
        this.emit('todos-batch-completed', ids);
        return { success: true, data: count };
      } catch (error) {
        console.error('批量完成待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取优先级统计
    ipcMain.handle('todo:getPriorityStats', async (event) => {
      try {
        const stats = this.getPriorityStats();
        return { success: true, data: stats };
      } catch (error) {
        console.error('获取优先级统计失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取标签建议
    ipcMain.handle('todo:getTagSuggestions', async (event, query) => {
      try {
        const suggestions = this.tagService.getTagSuggestions(query);
        return { success: true, data: suggestions };
      } catch (error) {
        console.error('获取标签建议失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 搜索标签
    ipcMain.handle('todo:searchTags', async (event, query) => {
      try {
        const tags = this.tagService.searchTags(query);
        return { success: true, data: tags };
      } catch (error) {
        console.error('搜索标签失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取待办事项标签统计
    ipcMain.handle('todo:getTodoTagStats', async (event) => {
      try {
        const stats = this.getTodoTagStats();
        return { success: true, data: stats };
      } catch (error) {
        console.error('获取待办事项标签统计失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 导出待办事项
    ipcMain.handle('todo:export', async (event, options) => {
      try {
        const data = this.exportTodos(options);
        return { success: true, data };
      } catch (error) {
        console.error('导出待办事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取重复事项
    ipcMain.handle('todo:getRecurring', async (event) => {
      try {
        const todos = this.getRecurringTodos();
        return { success: true, data: todos };
      } catch (error) {
        console.error('获取重复事项失败:', error);
        return { success: false, error: error.message };
      }
    });

    // 处理到期的重复事项
    ipcMain.handle('todo:processRecurring', async (event) => {
      try {
        const result = this.processRecurringTodos();
        return { success: true, data: result };
      } catch (error) {
        console.error('处理重复事项失败:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * 创建待办事项
   */
  createTodo(todoData) {
    // 验证必填字段
    if (!todoData.content || todoData.content.trim() === '') {
      throw new Error('待办事项内容不能为空');
    }

    // 处理日期格式
    if (todoData.due_date) {
      todoData.due_date = new Date(todoData.due_date).toISOString();
    }

    // 处理标签格式
    const formattedTags = TagService.formatTags(TagService.parseTags(todoData.tags || ''));

    const todo = this.todoDAO.create({
      content: todoData.content.trim(),
      description: todoData.description || '',
      tags: formattedTags,
      is_important: todoData.is_important ? 1 : 0,
      is_urgent: todoData.is_urgent ? 1 : 0,
      due_date: todoData.due_date || null,
      repeat_type: todoData.repeat_type || 'none',
      repeat_interval: todoData.repeat_interval || 1,
      repeat_days: todoData.repeat_days || ''
    });

    // 更新标签使用次数
    if (formattedTags) {
      this.tagService.updateTagsUsage(formattedTags);
    }

    return todo;
  }

  /**
   * 获取所有待办事项
   */
  getAllTodos(options = {}) {
    return this.todoDAO.findAll(options);
  }

  /**
   * 按四象限获取待办事项
   */
  getTodosByQuadrant(includeCompleted = false) {
    return this.todoDAO.findByQuadrant(includeCompleted);
  }

  /**
   * 根据ID获取待办事项
   */
  getTodoById(id) {
    return this.todoDAO.findById(id);
  }

  /**
   * 更新待办事项
   */
  updateTodo(id, todoData) {
    const existingTodo = this.todoDAO.findById(id);
    if (!existingTodo) {
      throw new Error('待办事项不存在');
    }

    // 处理日期格式
    if (todoData.due_date) {
      todoData.due_date = new Date(todoData.due_date).toISOString();
    }

    // 处理标签字段和使用次数
    if (todoData.tags !== undefined) {
      const oldTags = TagService.parseTags(existingTodo.tags || '');
      const newTags = TagService.parseTags(todoData.tags || '');
      const formattedTags = TagService.formatTags(newTags);
      
      todoData.tags = formattedTags;
      
      // 更新标签使用次数
      if (oldTags.length > 0) {
        this.tagService.decreaseTagsUsage(oldTags);
      }
      if (newTags.length > 0) {
        this.tagService.updateTagsUsage(newTags);
      }
    }
    
    // 转换布尔值为数字
    if (todoData.is_important !== undefined) {
      todoData.is_important = todoData.is_important ? 1 : 0;
    }
    if (todoData.is_urgent !== undefined) {
      todoData.is_urgent = todoData.is_urgent ? 1 : 0;
    }
    if (todoData.is_completed !== undefined) {
      todoData.is_completed = todoData.is_completed ? 1 : 0;
    }

    return this.todoDAO.update(id, todoData);
  }

  /**
   * 删除待办事项
   */
  deleteTodo(id) {
    const existingTodo = this.todoDAO.findById(id);
    if (!existingTodo) {
      throw new Error('待办事项不存在');
    }

    // 减少标签使用次数
    if (existingTodo.tags) {
      const tags = TagService.parseTags(existingTodo.tags);
      if (tags.length > 0) {
        this.tagService.decreaseTagsUsage(tags);
      }
    }

    return this.todoDAO.delete(id);
  }

  /**
   * 切换待办事项完成状态
   */
  toggleTodoComplete(id) {
    const todo = this.todoDAO.findById(id);
    if (!todo) {
      throw new Error('待办事项不存在');
    }

    const newStatus = todo.is_completed ? 0 : 1;
    const updatedTodo = this.todoDAO.update(id, { is_completed: newStatus });

    // 如果任务被标记为完成且有重复设置，创建下次重复任务
    if (newStatus === 1 && todo.repeat_type && todo.repeat_type !== 'none') {
      this.handleRecurringTodo(todo);
    }

    return updatedTodo;
  }

  /**
   * 为待办事项累加专注时长
   */
  addFocusTime(id, durationSeconds) {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('专注时长必须为正数');
    }

    const existingTodo = this.todoDAO.findById(id);
    if (!existingTodo) {
      throw new Error('待办事项不存在');
    }

    return this.todoDAO.addFocusTime(id, durationSeconds);
  }

  /**
   * 获取统计信息
   */
  getTodoStats() {
    return this.todoDAO.getStats();
  }

  /**
   * 获取优先级统计
   */
  getPriorityStats() {
    return this.todoDAO.getPriorityStats();
  }

  /**
   * 获取待办事项标签统计
   */
  getTodoTagStats() {
    return this.todoDAO.getTodoTagStats();
  }

  /**
   * 获取指定日期的待办事项
   */
  getTodosByDate(dateString) {
    return this.todoDAO.findByDate(dateString);
  }

  /**
   * 获取今日到期的待办事项
   */
  getTodosDueToday() {
    return this.todoDAO.findDueToday();
  }

  /**
   * 获取逾期的待办事项
   */
  getOverdueTodos() {
    return this.todoDAO.findOverdue();
  }

  /**
   * 搜索待办事项
   */
  searchTodos(query) {
    return this.todoDAO.search(query);
  }

  /**
   * 按优先级排序获取待办事项
   */
  getTodosByPriority() {
    return this.todoDAO.findByPriority();
  }

  /**
   * 按截止时间排序获取待办事项
   */
  getTodosByDueDate() {
    return this.todoDAO.findByDueDate();
  }

  /**
   * 按创建时间排序获取待办事项
   */
  getTodosByCreatedAt() {
    return this.todoDAO.findByCreatedAt();
  }

  /**
   * 批量更新待办事项
   */
  batchUpdateTodos(updates) {
    return this.todoDAO.batchUpdate(updates);
  }

  /**
   * 批量删除待办事项
   */
  batchDeleteTodos(ids) {
    // 获取要删除的todos的标签信息
    const todos = ids.map(id => this.todoDAO.findById(id)).filter(todo => todo);
    
    // 减少标签使用次数
    todos.forEach(todo => {
      if (todo.tags) {
        const tags = TagService.parseTags(todo.tags);
        if (tags.length > 0) {
          this.tagService.decreaseTagsUsage(tags);
        }
      }
    });
    
    return this.todoDAO.batchDelete(ids);
  }

  /**
   * 批量完成待办事项
   */
  batchCompleteTodos(ids) {
    return this.todoDAO.batchComplete(ids);
  }

  /**
   * 导入待办事项
   */
  importTodos(todos) {
    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    todos.forEach((todoData, index) => {
      try {
        this.createTodo(todoData);
        successCount++;
      } catch (error) {
        failureCount++;
        errors.push({
          index,
          error: error.message,
          data: todoData
        });
      }
    });

    const result = {
      success: successCount,
      failure: failureCount,
      total: todos.length,
      errors
    };

    this.emit('todos-imported', result);
    return result;
  }

  /**
   * 导出待办事项
   */
  exportTodos(options = {}) {
    const todos = this.getAllTodos(options);
    return {
      version: '2.0',
      exportTime: new Date().toISOString(),
      data: {
        todos: todos.map(todo => ({
          content: todo.content,
          is_completed: Boolean(todo.is_completed),
          is_important: Boolean(todo.is_important),
          is_urgent: Boolean(todo.is_urgent),
          due_date: todo.due_date,
          created_at: todo.created_at,
          completed_at: todo.completed_at
        }))
      }
    };
  }

  /**
   * 处理重复任务
   */
  handleRecurringTodo(todo) {
    if (!todo.repeat_type || todo.repeat_type === 'none') {
      return null;
    }

    const nextDueDate = RepeatUtils.calculateNextDueDate(todo.due_date, todo.repeat_type, todo.repeat_interval, todo.repeat_days);
    
    if (nextDueDate) {
      const newTodo = {
        content: todo.content,
        tags: todo.tags,
        is_important: todo.is_important,
        is_urgent: todo.is_urgent,
        due_date: nextDueDate,
        repeat_type: todo.repeat_type,
        repeat_interval: todo.repeat_interval,
        repeat_days: todo.repeat_days
      };
      
      return this.createTodo(newTodo);
    }
    
    return null;
  }

  /**
   * 获取重复事项
   */
  getRecurringTodos() {
    return this.todoDAO.findRecurringTodos();
  }

  /**
   * 处理到期的重复事项
   */
  processRecurringTodos() {
    const recurringTodos = this.getRecurringTodos();
    let processedCount = 0;
    const newTodos = [];

    recurringTodos.forEach(todo => {
      if (todo.is_completed && todo.repeat_type && todo.repeat_type !== 'none') {
        const newTodo = this.handleRecurringTodo(todo);
        if (newTodo) {
          newTodos.push(newTodo);
          processedCount++;
        }
      }
    });

    return {
      processedCount,
      newTodos
    };
  }

  /**
   * 检查并通知到期的待办事项
   */
  checkAndNotifyDueTodos() {
    try {
      const dueTodos = this.getDueTodosForNotification();
      
      if (this.notificationService && dueTodos.length > 0) {
        this.notificationService.handleDueTodos(dueTodos);
      }
    } catch (error) {
      console.error('检查到期待办事项时出错:', error);
    }
  }

  /**
   * 获取需要通知的到期待办事项
   * @returns {Array} 到期的待办事项列表
   */
  getDueTodosForNotification() {
    const now = new Date();
    const dueTodos = [];

    // 获取今日到期的待办事项
    const todayDue = this.getTodosDueToday();
    dueTodos.push(...todayDue);

    // 获取逾期的待办事项
    const overdue = this.getOverdueTodos();
    dueTodos.push(...overdue);

    // 获取即将到期的待办事项（未来1小时内）
    const soonDue = this.getTodosDueSoon(60); // 60分钟内
    dueTodos.push(...soonDue);

    // 去重（避免同一个待办事项出现在多个列表中）
    const uniqueTodos = dueTodos.filter((todo, index, self) => 
      index === self.findIndex(t => t.id === todo.id)
    );

    return uniqueTodos;
  }

  /**
   * 获取即将到期的待办事项
   * @param {number} minutesAhead - 提前多少分钟
   * @returns {Array} 即将到期的待办事项列表
   */
  getTodosDueSoon(minutesAhead = 60) {
    try {
      const db = this.todoDAO.getDB();
      const nowUTC = TimeZoneUtils.nowUTC();
      const soonTimeUTC = TimeZoneUtils.addMinutesUTC(minutesAhead);
      
      console.log(`[TodoService] 查询即将到期的待办事项 (${minutesAhead}分钟内):`);
      console.log(`  - 当前时间 (UTC): ${nowUTC}`);
      console.log(`  - 截止时间 (UTC): ${soonTimeUTC}`);
      
      const stmt = db.prepare(`
         SELECT * FROM todos 
         WHERE is_completed = 0 
           AND due_date > ?
           AND due_date <= ?
         ORDER BY due_date ASC
       `);
      
      const results = stmt.all(nowUTC, soonTimeUTC);
      console.log(`  - 找到 ${results.length} 个即将到期的待办事项`);
      
      return results;
    } catch (error) {
      console.error('获取即将到期的待办事项时出错:', error);
      return [];
    }
  }

  /**
   * 手动触发通知检查（用于测试）
   */
  triggerNotificationCheck() {
    this.checkAndNotifyDueTodos();
  }
}

module.exports = TodoService;