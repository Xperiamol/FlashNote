const DatabaseManager = require('../dao/DatabaseManager');

/**
 * 历史数据迁移到 Mem0 服务
 * 符合 SOLID 原则：单一职责 - 只负责历史数据分析和迁移
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
      batchSize: 50
    };
  }

  /**
   * 执行完整的历史数据迁移
   * @param {string} userId - 用户ID
   * @returns {Promise<{success: boolean, memoryCount: number, errors: Array}>}
   */
  async migrateAll(userId) {
    console.log('[Migration] 开始分析历史数据...');
    
    const results = {
      memoryCount: 0,
      errors: []
    };

    try {
      // 1. 分析待办事项模式
      results.memoryCount += await this._analyzeTodoPatterns(userId);
      
      // 2. 分析完成任务速度
      results.memoryCount += await this._analyzeCompletionSpeed(userId);
      
      // 3. 迁移笔记内容
      results.memoryCount += await this._migrateNotes(userId);
      
      console.log(`[Migration] 迁移完成，共创建 ${results.memoryCount} 条记忆`);
      
      return {
        success: true,
        memoryCount: results.memoryCount,
        errors: results.errors
      };
    } catch (error) {
      console.error('[Migration] 迁移失败:', error);
      return {
        success: false,
        memoryCount: results.memoryCount,
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
   * 迁移笔记内容
   * @private
   */
  async _migrateNotes(userId) {
    const notes = this._getNotesInPeriod(this.config.daysToAnalyze);
    console.log(`[Migration] 找到 ${notes.length} 篇笔记，开始存储完整内容...`);
    
    let memoryCount = 0;

    // 批量处理笔记
    for (const note of notes) {
      try {
        await this._storeNoteAsMemory(userId, note);
        memoryCount++;
        
        // 进度日志
        if (memoryCount % this.config.batchSize === 0) {
          console.log(`[Migration] 已处理 ${memoryCount}/${notes.length} 条笔记...`);
        }
      } catch (err) {
        console.error(`[Migration] 存储笔记 ${note.id} 失败:`, err.message);
      }
    }

    console.log(`[Migration] 笔记存储完成，共 ${notes.length} 条`);

    // 笔记频率分析
    if (notes.length > this.config.minNotesForFrequencyAnalysis) {
      await this._analyzeNoteFrequency(userId, notes.length);
      memoryCount++;
    }

    return memoryCount;
  }

  /**
   * 将单条笔记存储为记忆
   * @private
   */
  async _storeNoteAsMemory(userId, note) {
    const fullContent = note.content.trim();
    const tags = note.tags 
      ? note.tags.split(',').map(t => t.trim()).filter(t => t) 
      : [];

    console.log(`[Migration] 处理笔记 ${note.id}，长度: ${fullContent.length} 字符`);

    const memoryId = await this.mem0Service.addMemory(
      userId,
      fullContent,
      {
        category: 'knowledge',
        metadata: {
          source: 'user_note',
          note_id: note.id,
          created_at: note.created_at,
          tags: tags,
          content_length: fullContent.length
        }
      }
    );

    console.log(`[Migration] 笔记 ${note.id} 存储成功，memory_id: ${memoryId}`);
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
      SELECT id, content, tags, created_at 
      FROM notes 
      WHERE created_at >= date('now', '-${days} days')
      AND length(content) > 20
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
