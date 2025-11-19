/**
 * Mem0 知识管理服务 V4
 * 集成 Mem0 框架，为 AI 任务规划提供记忆能力
 * 
 * 功能：
 * - 记住用户的任务规划偏好（重要性/紧急性倾向）
 * - 学习用户的任务分解模式
 * - 记录任务时间估算习惯
 * - 提供个性化的任务建议
 */

const { EventEmitter } = require('events');

class Mem0ServiceV4 extends EventEmitter {
  constructor(settingDAO) {
    super();
    this.settingDAO = settingDAO;
    this.memoryClient = null;
    this.initialized = false;
  }

  /**
   * 初始化 Mem0 服务
   */
  async initialize() {
    try {
      // 确保配置存在
      this.ensureDefaultSettings();
      
      // 检查是否启用
      const enabled = this.settingDAO.get('mem0_enabled')?.value === 'true';
      if (!enabled) {
        console.log('[Mem0 V4] Service disabled in settings');
        this.initialized = false;
        return { success: true, message: 'Mem0 service disabled' };
      }

      // 获取 API Key
      const apiKey = this.settingDAO.get('mem0_api_key')?.value;
      if (!apiKey) {
        console.warn('[Mem0 V4] No API key configured');
        this.initialized = false;
        return { success: false, error: 'Mem0 API key not configured' };
      }

      // 动态导入 mem0ai SDK
      try {
        const { MemoryClient } = require('mem0ai');
        this.memoryClient = new MemoryClient({ apiKey });
        console.log('[Mem0 V4] MemoryClient initialized');
      } catch (error) {
        console.error('[Mem0 V4] Failed to import mem0ai:', error.message);
        console.log('[Mem0 V4] Please install: npm install mem0ai');
        this.initialized = false;
        return { success: false, error: 'mem0ai package not installed' };
      }

      this.initialized = true;
      console.log('[Mem0 V4] Service initialized successfully');
      return { success: true };

    } catch (error) {
      console.error('[Mem0 V4] Initialization failed:', error);
      this.initialized = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * 确保默认设置存在
   */
  ensureDefaultSettings() {
    const defaults = [
      { 
        key: 'mem0_enabled', 
        value: 'false', 
        type: 'boolean', 
        description: 'Mem0 记忆功能开关' 
      },
      { 
        key: 'mem0_api_key', 
        value: '', 
        type: 'string', 
        description: 'Mem0 API 密钥' 
      },
      { 
        key: 'mem0_user_id', 
        value: 'default_user', 
        type: 'string', 
        description: 'Mem0 用户标识' 
      }
    ];

    defaults.forEach(({ key, value, type, description }) => {
      const existing = this.settingDAO.get(key);
      if (!existing) {
        this.settingDAO.set(key, value, type, description);
      }
    });
  }

  /**
   * 检查服务是否可用
   */
  isAvailable() {
    return this.initialized && this.memoryClient !== null;
  }

  /**
   * 获取用户 ID
   */
  getUserId() {
    return this.settingDAO.get('mem0_user_id')?.value || 'default_user';
  }

  /**
   * 搜索相关记忆
   * @param {string} query - 搜索查询
   * @param {object} options - 搜索选项
   * @returns {Promise<Array>} 记忆列表
   */
  async searchMemories(query, options = {}) {
    if (!this.isAvailable()) {
      console.warn('[Mem0 V4] Service not available');
      return [];
    }

    try {
      const userId = this.getUserId();
      const searchOptions = {
        user_id: userId,
        limit: options.limit || 5,
        ...options
      };

      console.log('[Mem0 V4] Searching memories:', { query, options: searchOptions });
      
      const result = await this.memoryClient.search(query, searchOptions);
      
      // 提取记忆文本
      const memories = result.results ? result.results.map(r => ({
        text: r.memory || r.text || '',
        score: r.score || 0,
        id: r.id,
        metadata: r.metadata || {}
      })) : [];

      console.log('[Mem0 V4] Found memories:', memories.length);
      return memories;

    } catch (error) {
      console.error('[Mem0 V4] Search failed:', error);
      return [];
    }
  }

  /**
   * 添加新记忆
   * @param {Array|string} messages - 对话消息或文本
   * @param {object} metadata - 元数据
   * @returns {Promise<boolean>} 是否成功
   */
  async addMemory(messages, metadata = {}) {
    if (!this.isAvailable()) {
      console.warn('[Mem0 V4] Service not available');
      return false;
    }

    try {
      const userId = this.getUserId();
      const options = {
        user_id: userId,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'ai-task-planner',
          ...metadata
        }
      };

      console.log('[Mem0 V4] Adding memory:', { messages, options });
      
      await this.memoryClient.add(messages, options);
      
      console.log('[Mem0 V4] Memory added successfully');
      return true;

    } catch (error) {
      console.error('[Mem0 V4] Add memory failed:', error);
      return false;
    }
  }

  /**
   * 为任务规划增强 AI 提示词
   * @param {string} taskDescription - 用户的任务描述
   * @param {string} basePrompt - 基础提示词
   * @returns {Promise<string>} 增强后的提示词
   */
  async enhanceTaskPrompt(taskDescription, basePrompt) {
    if (!this.isAvailable()) {
      return basePrompt;
    }

    try {
      // 搜索相关的历史任务规划记忆
      const memories = await this.searchMemories(taskDescription, {
        limit: 3,
        metadata: { category: 'task-planning' }
      });

      if (memories.length === 0) {
        console.log('[Mem0 V4] No relevant memories found');
        return basePrompt;
      }

      // 构造记忆上下文
      const memoryContext = memories
        .map((m, idx) => `${idx + 1}. ${m.text}`)
        .join('\n');

      // 在提示词中加入记忆
      const enhancedPrompt = `${basePrompt}

## 用户偏好和历史记忆

根据以往的任务规划，了解到以下用户习惯：
${memoryContext}

请结合这些习惯，提供更符合用户风格的任务拆解。`;

      console.log('[Mem0 V4] Prompt enhanced with', memories.length, 'memories');
      return enhancedPrompt;

    } catch (error) {
      console.error('[Mem0 V4] Enhance prompt failed:', error);
      return basePrompt;
    }
  }

  /**
   * 记录任务规划结果
   * @param {string} taskDescription - 任务描述
   * @param {Array} generatedTasks - 生成的任务列表
   * @param {object} userFeedback - 用户反馈（如果有）
   */
  async recordTaskPlanning(taskDescription, generatedTasks, userFeedback = {}) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // 分析任务特征
      const importantCount = generatedTasks.filter(t => t.is_important).length;
      const urgentCount = generatedTasks.filter(t => t.is_urgent).length;
      const withDueDateCount = generatedTasks.filter(t => t.due_date).length;

      // 构造记忆内容
      const messages = [
        {
          role: 'user',
          content: `任务：${taskDescription}`
        },
        {
          role: 'assistant',
          content: `生成了 ${generatedTasks.length} 个子任务，其中 ${importantCount} 个重要，${urgentCount} 个紧急，${withDueDateCount} 个设置了截止日期。`
        }
      ];

      // 如果有用户反馈（如删除某些任务、修改优先级等）
      if (userFeedback.modified) {
        messages.push({
          role: 'user',
          content: `用户反馈：${userFeedback.comment || '进行了调整'}`
        });
      }

      // 记录到 Mem0
      await this.addMemory(messages, {
        category: 'task-planning',
        task_count: generatedTasks.length,
        important_ratio: importantCount / generatedTasks.length,
        urgent_ratio: urgentCount / generatedTasks.length,
        has_due_dates: withDueDateCount > 0
      });

      console.log('[Mem0 V4] Task planning recorded');
      return true;

    } catch (error) {
      console.error('[Mem0 V4] Record task planning failed:', error);
      return false;
    }
  }

  /**
   * 获取用户的任务规划统计
   * @returns {Promise<object>} 统计信息
   */
  async getTaskPlanningStats() {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const memories = await this.searchMemories('任务规划', {
        limit: 20,
        metadata: { category: 'task-planning' }
      });

      // 简单统计
      return {
        total_plannings: memories.length,
        recent_memories: memories.slice(0, 5).map(m => m.text)
      };

    } catch (error) {
      console.error('[Mem0 V4] Get stats failed:', error);
      return null;
    }
  }

  /**
   * 清除所有记忆（谨慎使用）
   */
  async clearAllMemories() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const userId = this.getUserId();
      // 注意：这个 API 可能不存在，需要根据实际 SDK 调整
      // await this.memoryClient.deleteAll({ user_id: userId });
      
      console.log('[Mem0 V4] Clear memories not implemented');
      return false;

    } catch (error) {
      console.error('[Mem0 V4] Clear memories failed:', error);
      return false;
    }
  }
}

module.exports = Mem0ServiceV4;
