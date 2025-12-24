const DatabaseManager = require('../dao/DatabaseManager');

/**
 * 历史数据迁移到 Mem0 服务
 * 符合 SOLID 原则：单一职责 - 只负责历史数据分析和迁移
 * 
 * 去重策略：直接查询 mem0_memories 表中的 metadata，检查 note_id 是否已存在
 * 无需额外的 JSON 状态文件，数据库是唯一真实来源(Single Source of Truth)
 */
class HistoricalDataMigrationService {
  constructor(mem0Service) {
    this.mem0Service = mem0Service;
    this.dbManager = DatabaseManager.getInstance();
    this.db = this.dbManager.getDatabase();

    // 配置参数
    this.config = {
      daysToAnalyze: 90,
      minNotesForFrequencyAnalysis: 20,
      minTodosForAnalysis: 10,
      priorityThreshold: 0.3,
      minKeywordFrequency: 5,
      maxFrequentKeywords: 10,
      batchSize: 50,
      autoMigrateIntervalHours: 1 // 每1小时自动执行一次，确保新笔记及时入库
    };

    // 上次迁移时间(从数据库推断)
    this.lastMigrateTime = null;
  }

  /**
   * 从数据库获取已迁移的笔记ID列表
   * @private
   */
  _getMigratedNoteIds() {
    try {
      // 查询 mem0_memories 表中所有来源为 user_note 的记忆
      const rows = this.db.prepare(`
        SELECT metadata FROM mem0_memories 
        WHERE metadata LIKE '%"source":"user_note"%'
      `).all();

      const noteIds = new Set();
      for (const row of rows) {
        try {
          const metadata = JSON.parse(row.metadata);
          if (metadata.note_id) {
            noteIds.add(String(metadata.note_id));
          }
        } catch (e) {
          // 忽略解析失败的记录
        }
      }

      console.log(`[Migration] 数据库中已有 ${noteIds.size} 篇笔记的记忆`);
      return noteIds;
    } catch (error) {
      console.error('[Migration] 查询已迁移笔记ID失败:', error);
      return new Set();
    }
  }

  /**
   * 从数据库获取已迁移的待办ID列表
   * @private
   */
  _getMigratedTodoIds() {
    try {
      const rows = this.db.prepare(`
        SELECT metadata FROM mem0_memories 
        WHERE metadata LIKE '%"source":"user_todo"%'
      `).all();

      const todoIds = new Set();
      for (const row of rows) {
        try {
          const metadata = JSON.parse(row.metadata);
          if (metadata.todo_id) {
            todoIds.add(String(metadata.todo_id));
          }
        } catch (e) {
          // 忽略解析失败的记录
        }
      }

      console.log(`[Migration] 数据库中已有 ${todoIds.size} 条待办的记忆`);
      return todoIds;
    } catch (error) {
      console.error('[Migration] 查询已迁移待办ID失败:', error);
      return new Set();
    }
  }

  /**
   * 检查是否需要自动迁移
   * 基于数据库中最新记忆的时间来判断
   */
  shouldAutoMigrate() {
    try {
      // 查询最近一条来自笔记迁移的记忆时间
      const row = this.db.prepare(`
        SELECT created_at FROM mem0_memories 
        WHERE metadata LIKE '%"source":"user_note"%'
        ORDER BY created_at DESC
        LIMIT 1
      `).get();

      if (!row) {
        return true; // 没有迁移记录，需要迁移
      }

      const lastTime = row.created_at;
      const now = Date.now();
      const hoursSinceLastMigrate = (now - lastTime) / (1000 * 60 * 60);

      return hoursSinceLastMigrate >= this.config.autoMigrateIntervalHours;
    } catch (error) {
      console.error('[Migration] 检查自动迁移状态失败:', error);
      return true; // 出错时执行迁移
    }
  }

  /**
   * 启动自动迁移定时器
   */
  startAutoMigration(userId) {
    this.userId = userId; // 保存 userId 用于后台触发

    // 先检查是否需要立即执行
    if (this.shouldAutoMigrate()) {
      console.log('[Migration] 需要执行自动迁移...');
      this.migrateAll(userId).catch(err => {
        console.error('[Migration] 自动迁移失败:', err);
      });
    }

    // 设置定时器,每小时检查一次是否需要迁移
    this.autoMigrateTimer = setInterval(() => {
      if (this.shouldAutoMigrate()) {
        console.log('[Migration] 定时执行自动迁移...');
        this.migrateAll(userId).catch(err => {
          console.error('[Migration] 定时自动迁移失败:', err);
        });
      }
    }, 60 * 60 * 1000); // 每小时检查一次

    console.log('[Migration] 自动迁移已启动，每小时执行一次');
  }

  /**
   * 停止自动迁移
   */
  stopAutoMigration() {
    if (this.autoMigrateTimer) {
      clearInterval(this.autoMigrateTimer);
      this.autoMigrateTimer = null;
      console.log('[Migration] 自动迁移已停止');
    }
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  /**
   * 应用进入后台时触发（延迟20秒执行）
   */
  triggerMigrationOnBackground() {
    // 如果已有后台定时器，先清除
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
    }

    console.log('[Migration] 应用进入后台，20秒后将执行迁移...');
    this.backgroundTimer = setTimeout(() => {
      const userId = this.userId || 'current_user';
      console.log('[Migration] 后台触发迁移...');
      this.migrateAll(userId).catch(err => {
        console.error('[Migration] 后台迁移失败:', err);
      });
    }, 20 * 1000); // 20秒后执行
  }

  /**
   * 应用返回前台时取消后台迁移
   */
  cancelBackgroundMigration() {
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
      console.log('[Migration] 应用返回前台，取消后台迁移');
    }
  }

  /**
   * 应用退出时触发迁移（同步执行）
   */
  async triggerMigrationOnQuit() {
    const userId = this.userId || 'current_user';
    console.log('[Migration] 应用即将退出，执行迁移...');
    try {
      await this.migrateAll(userId);
      console.log('[Migration] 退出前迁移完成');
    } catch (err) {
      console.error('[Migration] 退出前迁移失败:', err);
    }
  }

  /**
   * 执行完整的历史数据迁移(增量,去重)
   * @param {string} userId - 用户ID
   * @returns {Promise<{success: boolean, memoryCount: number, skippedCount: number, errors: Array}>}
   */
  async migrateAll(userId) {
    console.log('[Migration] 开始分析历史数据(增量模式)...');

    const results = {
      memoryCount: 0,
      skippedCount: 0,
      errors: []
    };

    try {
      // 检查是否是首次迁移（数据库中没有用户笔记记忆）
      const migratedNoteIds = this._getMigratedNoteIds();
      const isFirstMigration = migratedNoteIds.size === 0;

      // 1. 分析待办事项模式(只在首次执行)
      if (isFirstMigration) {
        results.memoryCount += await this._analyzeTodoPatterns(userId);
        results.memoryCount += await this._analyzeCompletionSpeed(userId);
      }

      // 2. 迁移笔记内容(增量,去重)
      const noteResult = await this._migrateNotes(userId);
      results.memoryCount += noteResult.added;
      results.skippedCount += noteResult.skipped;

      // 3. 迁移待办事项内容(增量,去重)
      const todoResult = await this._migrateTodos(userId);
      results.memoryCount += todoResult.added;
      results.skippedCount += todoResult.skipped;

      console.log(`[Migration] 迁移完成，新增 ${results.memoryCount} 条记忆，跳过 ${results.skippedCount} 条重复`);

      return {
        success: true,
        memoryCount: results.memoryCount,
        skippedCount: results.skippedCount,
        errors: results.errors
      };
    } catch (error) {
      console.error('[Migration] 迁移失败:', error);
      return {
        success: false,
        memoryCount: results.memoryCount,
        skippedCount: results.skippedCount,
        errors: [...results.errors, error.message]
      };
    }
  }

  /**
   * 分析待办事项模式
   * @private
   */
  async _analyzeTodoPatterns(userId) {
    const todos = this._getTodosInPeriod(this.config.daysToAnalyze);
    console.log(`[Migration] 找到 ${todos.length} 个待办事项`);

    if (todos.length === 0) return 0;

    let memoryCount = 0;

    // 优先级分析
    memoryCount += await this._analyzePriorityPattern(userId, todos);

    // 任务类型分析
    memoryCount += await this._analyzeFrequentTopics(userId, todos);

    return memoryCount;
  }

  /**
   * 分析优先级模式
   * @private
   */
  async _analyzePriorityPattern(userId, todos) {
    const { importantRatio, urgentRatio } = this._calculatePriorityRatios(todos);
    let count = 0;

    if (importantRatio > this.config.priorityThreshold * 100) {
      await this.mem0Service.addMemory(
        userId,
        `用户在过去${this.config.daysToAnalyze}天创建了${todos.length}个待办事项，其中${importantRatio.toFixed(0)}%标记为重要，显示出对重要任务的重视`,
        {
          category: 'task_planning',
          metadata: {
            source: 'historical_analysis',
            type: 'priority_pattern',
            ratio: importantRatio
          }
        }
      );
      count++;
    }

    if (urgentRatio > this.config.priorityThreshold * 100) {
      await this.mem0Service.addMemory(
        userId,
        `用户有${urgentRatio.toFixed(0)}%的任务标记为紧急，倾向于处理时间敏感的工作`,
        {
          category: 'task_planning',
          metadata: {
            source: 'historical_analysis',
            type: 'urgency_pattern',
            ratio: urgentRatio
          }
        }
      );
      count++;
    }

    return count;
  }

  /**
   * 分析常见任务类型
   * @private
   */
  async _analyzeFrequentTopics(userId, todos) {
    const frequentKeywords = this._extractFrequentKeywords(todos);

    if (frequentKeywords.length === 0) return 0;

    await this.mem0Service.addMemory(
      userId,
      `用户经常创建与这些主题相关的任务：${frequentKeywords.join('、')}`,
      {
        category: 'task_planning',
        metadata: {
          source: 'historical_analysis',
          type: 'frequent_topics',
          keywords: frequentKeywords
        }
      }
    );

    return 1;
  }

  /**
   * 分析任务完成速度
   * @private
   */
  async _analyzeCompletionSpeed(userId) {
    const completedTodos = this._getCompletedTodosInPeriod(this.config.daysToAnalyze);
    console.log(`[Migration] 找到 ${completedTodos.length} 个已完成任务`);

    if (completedTodos.length < this.config.minTodosForAnalysis) return 0;

    const avgCompletionDays = this._calculateAverageCompletionDays(completedTodos);

    await this.mem0Service.addMemory(
      userId,
      `用户平均在${avgCompletionDays.toFixed(1)}天内完成任务，显示出稳定的执行力`,
      {
        category: 'task_planning',
        metadata: {
          source: 'historical_analysis',
          type: 'completion_speed',
          avg_days: avgCompletionDays
        }
      }
    );

    return 1;
  }

  /**
   * 迁移笔记内容(增量,去重)
   * 去重策略：直接查询数据库，确保数据一致性
   * @private
   */
  async _migrateNotes(userId) {
    const notes = this._getNotesInPeriod(this.config.daysToAnalyze);

    // 从数据库获取已迁移的笔记ID（Single Source of Truth）
    const migratedNoteIds = this._getMigratedNoteIds();

    console.log(`[Migration] 找到 ${notes.length} 篇笔记，数据库中已有 ${migratedNoteIds.size} 篇，检查去重...`);

    let addedCount = 0;
    let skippedCount = 0;

    // 批量处理笔记
    for (const note of notes) {
      try {
        // 去重检查：直接用数据库查询结果
        const noteIdStr = String(note.id);
        if (migratedNoteIds.has(noteIdStr)) {
          skippedCount++;
          continue;
        }

        // 详细日志：显示即将迁移的笔记信息
        console.log(`[Migration] 迁移笔记 id=${note.id}, type=${note.note_type || 'markdown'}, created=${note.created_at}, contentLen=${note.content?.length || 0}`);

        await this._storeNoteAsMemory(userId, note);
        addedCount++;

        // 进度日志
        if (addedCount % this.config.batchSize === 0) {
          console.log(`[Migration] 已处理 ${addedCount} 条新笔记...`);
        }
      } catch (err) {
        console.error(`[Migration] 存储笔记 ${note.id} 失败:`, err.message);
      }
    }

    console.log(`[Migration] 笔记存储完成，新增 ${addedCount} 条，跳过 ${skippedCount} 条重复`);

    // 笔记频率分析(只在首次有大量笔记时执行)
    const isFirstMigration = migratedNoteIds.size === 0;
    if (isFirstMigration && notes.length > this.config.minNotesForFrequencyAnalysis) {
      await this._analyzeNoteFrequency(userId, notes.length);
      addedCount++;
    }

    return { added: addedCount, skipped: skippedCount };
  }

  /**
   * 将单条笔记存储为记忆
   * @private
   */
  async _storeNoteAsMemory(userId, note) {
    let fullContent = note.content.trim();
    const tags = note.tags
      ? note.tags.split(',').map(t => t.trim()).filter(t => t)
      : [];

    // 白板笔记特殊处理：提取 Excalidraw 中的文字内容
    if (note.note_type === 'whiteboard') {
      try {
        const whiteboardData = JSON.parse(fullContent);
        const textElements = [];

        // 提取所有 text 类型的元素
        if (whiteboardData.elements && Array.isArray(whiteboardData.elements)) {
          whiteboardData.elements.forEach(element => {
            if (element.type === 'text' && element.text && element.text.trim()) {
              textElements.push(element.text.trim());
            }
          });
        }

        if (textElements.length > 0) {
          fullContent = textElements.join('\n');
          console.log(`[Migration] 白板笔记 ${note.id}，提取到 ${textElements.length} 个文字元素`);
        } else {
          console.log(`[Migration] 白板笔记 ${note.id} 无文字内容，跳过`);
          return; // 无文字内容的白板笔记不存储
        }
      } catch (e) {
        console.warn(`[Migration] 白板笔记 ${note.id} JSON 解析失败:`, e.message);
        return; // 解析失败的白板笔记跳过
      }
    }

    console.log(`[Migration] 处理笔记 ${note.id}，长度: ${fullContent.length} 字符`);

    const memoryId = await this.mem0Service.addMemory(
      userId,
      fullContent,
      {
        category: 'knowledge',
        metadata: {
          source: 'user_note',
          note_id: note.id,
          note_type: note.note_type || 'markdown',
          created_at: note.created_at,
          tags: tags,
          content_length: fullContent.length
        }
      }
    );

    console.log(`[Migration] 笔记 ${note.id} 存储成功，memory_id: ${memoryId}`);
  }

  /**
   * 迁移待办事项内容(增量,去重)
   * @private
   */
  async _migrateTodos(userId) {
    const todos = this._getActiveTodosInPeriod(this.config.daysToAnalyze);
    const migratedTodoIds = this._getMigratedTodoIds();

    console.log(`[Migration] 找到 ${todos.length} 条待办，数据库中已有 ${migratedTodoIds.size} 条，检查去重...`);

    let addedCount = 0;
    let skippedCount = 0;

    for (const todo of todos) {
      try {
        const todoIdStr = String(todo.id);
        if (migratedTodoIds.has(todoIdStr)) {
          skippedCount++;
          continue;
        }

        // 跳过内容太短的待办
        if (!todo.content || todo.content.trim().length < 5) {
          continue;
        }

        console.log(`[Migration] 迁移待办 id=${todo.id}, content=${todo.content.substring(0, 30)}...`);

        await this._storeTodoAsMemory(userId, todo);
        addedCount++;

      } catch (err) {
        console.error(`[Migration] 存储待办 ${todo.id} 失败:`, err.message);
      }
    }

    console.log(`[Migration] 待办存储完成，新增 ${addedCount} 条，跳过 ${skippedCount} 条重复`);
    return { added: addedCount, skipped: skippedCount };
  }

  /**
   * 将单条待办存储为记忆
   * @private
   */
  async _storeTodoAsMemory(userId, todo) {
    // 构建待办描述文本
    const priorityText = todo.is_important && todo.is_urgent ? '紧急重要' :
      todo.is_important ? '重要' :
        todo.is_urgent ? '紧急' : '';
    const statusText = todo.is_completed ? '已完成' : '待处理';
    // 使用完整的日期时间格式（包含具体时间，如 2025/12/24 14:30）
    const dueDateText = todo.due_date ? `截止于 ${new Date(todo.due_date).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })}` : '';

    // 判断是否按时完成
    let onTimeStatus = null; // null = 无截止日期或未完成, true = 按时完成, false = 逾期完成
    let onTimeText = '';
    if (todo.is_completed && todo.due_date && todo.completed_at) {
      const dueDate = new Date(todo.due_date);
      const completedDate = new Date(todo.completed_at);
      onTimeStatus = completedDate <= dueDate;
      onTimeText = onTimeStatus ? '按时完成' : '逾期完成';
    } else if (todo.is_completed && todo.due_date && !todo.completed_at) {
      // 已完成但没有完成时间记录，假设按时完成
      onTimeStatus = true;
      onTimeText = '按时完成';
    }

    let content = `待办任务: ${todo.content}`;
    if (todo.description) {
      content += `\n描述: ${todo.description}`;
    }
    if (priorityText) {
      content += `\n优先级: ${priorityText}`;
    }
    if (dueDateText) {
      content += `\n${dueDateText}`;
    }
    content += `\n状态: ${statusText}`;
    if (onTimeText) {
      content += ` (${onTimeText})`;
    }

    const memoryId = await this.mem0Service.addMemory(
      userId,
      content,
      {
        category: 'knowledge',
        metadata: {
          source: 'user_todo',
          todo_id: todo.id,
          is_completed: todo.is_completed,
          is_important: todo.is_important,
          is_urgent: todo.is_urgent,
          completed_on_time: onTimeStatus,
          created_at: todo.created_at,
          content_length: content.length
        }
      }
    );

    console.log(`[Migration] 待办 ${todo.id} 存储成功，memory_id: ${memoryId}${onTimeText ? '，' + onTimeText : ''}`);
  }

  /**
   * 获取指定时间段内的活跃待办事项（不在回收站）
   * @private
   */
  _getActiveTodosInPeriod(days) {
    return this.db.prepare(`
      SELECT id, content, description, is_completed, is_important, is_urgent, due_date, completed_at, created_at 
      FROM todos 
      WHERE created_at >= date('now', '-${days} days')
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY created_at DESC
    `).all();
  }

  /**
   * 分析笔记频率
   * @private
   */
  async _analyzeNoteFrequency(userId, noteCount) {
    const weeksInPeriod = this.config.daysToAnalyze / 7;
    const notesPerWeek = (noteCount / weeksInPeriod).toFixed(1);

    await this.mem0Service.addMemory(
      userId,
      `用户保持着良好的笔记习惯，平均每周记录${notesPerWeek}篇笔记`,
      {
        category: 'note_taking',
        metadata: {
          source: 'historical_analysis',
          type: 'note_frequency',
          per_week: notesPerWeek
        }
      }
    );
  }

  // ========== 数据查询方法 ==========

  /**
   * 获取指定时间段内的待办事项
   * @private
   */
  _getTodosInPeriod(days) {
    return this.db.prepare(`
      SELECT * FROM todos 
      WHERE created_at >= date('now', '-${days} days')
      ORDER BY created_at DESC
    `).all();
  }

  /**
   * 获取指定时间段内已完成的待办事项
   * @private
   */
  _getCompletedTodosInPeriod(days) {
    return this.db.prepare(`
      SELECT 
        content,
        is_important,
        is_urgent,
        created_at,
        completed_at,
        JULIANDAY(completed_at) - JULIANDAY(created_at) as completion_days
      FROM todos 
      WHERE is_completed = 1 
      AND completed_at >= date('now', '-${days} days')
    `).all();
  }

  /**
   * 获取指定时间段内的笔记
   * @private
   */
  _getNotesInPeriod(days) {
    return this.db.prepare(`
      SELECT id, content, tags, created_at, note_type 
      FROM notes 
      WHERE created_at >= date('now', '-${days} days')
      AND length(content) > 1
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY created_at DESC
    `).all();
  }

  // ========== 数据处理方法 ==========

  /**
   * 计算优先级比率
   * @private
   */
  _calculatePriorityRatios(todos) {
    const total = todos.length;
    const importantCount = todos.filter(t => t.is_important === 1).length;
    const urgentCount = todos.filter(t => t.is_urgent === 1).length;

    return {
      importantRatio: (importantCount / total) * 100,
      urgentRatio: (urgentCount / total) * 100
    };
  }

  /**
   * 提取高频关键词
   * @private
   */
  _extractFrequentKeywords(todos) {
    const taskTypes = new Map();

    todos.forEach(todo => {
      const keywords = todo.content.split(/[,，、\s]+/).filter(w => w.length > 1);
      keywords.forEach(kw => {
        taskTypes.set(kw, (taskTypes.get(kw) || 0) + 1);
      });
    });

    return Array.from(taskTypes.entries())
      .filter(([_, count]) => count >= this.config.minKeywordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.config.maxFrequentKeywords)
      .map(([kw]) => kw);
  }

  /**
   * 计算平均完成天数
   * @private
   */
  _calculateAverageCompletionDays(completedTodos) {
    const total = completedTodos.reduce(
      (sum, t) => sum + (t.completion_days || 0),
      0
    );
    return total / completedTodos.length;
  }
}

module.exports = HistoricalDataMigrationService;
