const TagDAO = require('../dao/TagDAO');
const { EventEmitter } = require('events');

/**
 * 标签服务类
 * 遵循SOLID原则中的单一职责原则，专门处理标签相关的业务逻辑
 * 遵循DRY原则，统一管理标签的解析、格式化和操作
 */
class TagService extends EventEmitter {
  constructor() {
    super();
    this.tagDAO = new TagDAO();
  }

  /**
   * 解析标签字符串为数组
   * @param {string|Array} tags - 标签字符串或数组
   * @returns {Array} 标签数组
   */
  static parseTags(tags) {
    if (Array.isArray(tags)) {
      return tags.map(tag => tag.toString().trim()).filter(tag => tag);
    }
    
    if (typeof tags === 'string' && tags.trim()) {
      return tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    
    return [];
  }

  /**
   * 格式化标签数组为字符串
   * @param {Array} tags - 标签数组
   * @returns {string} 标签字符串
   */
  static formatTags(tags) {
    if (!Array.isArray(tags)) {
      return '';
    }
    
    return tags.map(tag => tag.toString().trim()).filter(tag => tag).join(',');
  }

  /**
   * 标准化标签数据格式（用于前端显示）
   * @param {string|Array} tags - 标签数据
   * @returns {Array} 标准化的标签数组
   */
  static normalizeTags(tags) {
    return TagService.parseTags(tags);
  }

  /**
   * 验证标签名称
   * @param {string} tagName - 标签名称
   * @returns {Object} 验证结果
   */
  static validateTagName(tagName) {
    if (!tagName || typeof tagName !== 'string') {
      return { valid: false, error: '标签名称不能为空' };
    }
    
    const trimmed = tagName.trim();
    if (!trimmed) {
      return { valid: false, error: '标签名称不能为空' };
    }
    
    if (trimmed.length > 50) {
      return { valid: false, error: '标签名称不能超过50个字符' };
    }
    
    if (trimmed.includes(',')) {
      return { valid: false, error: '标签名称不能包含逗号' };
    }
    
    return { valid: true, tagName: trimmed };
  }

  /**
   * 批量验证标签
   * @param {Array} tags - 标签数组
   * @returns {Object} 验证结果
   */
  static validateTags(tags) {
    const parsedTags = TagService.parseTags(tags);
    const validTags = [];
    const errors = [];
    
    for (const tag of parsedTags) {
      const validation = TagService.validateTagName(tag);
      if (validation.valid) {
        validTags.push(validation.tagName);
      } else {
        errors.push(`标签 "${tag}": ${validation.error}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      validTags,
      errors
    };
  }

  /**
   * 更新标签使用次数
   * @param {string|Array} tags - 标签
   */
  async updateTagsUsage(tags) {
    try {
      const tagArray = TagService.parseTags(tags);
      if (tagArray.length > 0) {
        this.tagDAO.updateTagsUsage(tagArray);
        this.emit('tags-updated', tagArray);
      }
    } catch (error) {
      console.error('更新标签使用次数失败:', error);
      throw error;
    }
  }

  /**
   * 减少标签使用次数
   * @param {string|Array} tags - 标签
   */
  async decreaseTagsUsage(tags) {
    try {
      const tagArray = TagService.parseTags(tags);
      if (tagArray.length > 0) {
        this.tagDAO.decreaseTagsUsage(tagArray);
        this.emit('tags-decreased', tagArray);
      }
    } catch (error) {
      console.error('减少标签使用次数失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有标签
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 标签列表
   */
  async getAllTags(options = {}) {
    try {
      const tags = await this.tagDAO.findAll(options);
      return {
        success: true,
        data: tags
      };
    } catch (error) {
      console.error('获取标签列表失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取热门标签
   * @param {number} limit - 限制数量
   * @returns {Promise<Object>} 热门标签列表
   */
  async getPopularTags(limit = 10) {
    try {
      const tags = this.tagDAO.findAll({ limit, orderBy: 'usage_count', order: 'DESC' });
      const popularTags = tags.filter(tag => tag.usage_count > 0);
      
      return {
        success: true,
        data: popularTags
      };
    } catch (error) {
      console.error('获取热门标签失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 搜索标签
   * @param {string} query - 搜索查询
   * @param {number} limit - 限制数量
   * @returns {Promise<Object>} 搜索结果
   */
  async searchTags(query, limit = 20) {
    try {
      const tags = this.tagDAO.searchByName(query, limit);
      return {
        success: true,
        data: tags
      };
    } catch (error) {
      console.error('搜索标签失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取标签建议
   * @param {string} input - 输入文本
   * @param {number} limit - 限制数量
   * @returns {Promise<Object>} 建议列表
   */
  async getTagSuggestions(input, limit = 10) {
    try {
      // 如果输入为空，返回最常用的标签
      if (!input || !input.trim()) {
        const tags = this.tagDAO.findAll({ limit, orderBy: 'usage_count', order: 'DESC' });
        return {
          success: true,
          data: tags.map(tag => tag.name)
        };
      }
      
      // 搜索匹配的标签
      const tags = this.tagDAO.searchByName(input.trim(), limit);
      return {
        success: true,
        data: tags.map(tag => tag.name)
      };
    } catch (error) {
      console.error('获取标签建议失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取标签统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getTagStats() {
    try {
      const stats = this.tagDAO.getStats();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('获取标签统计失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 清理未使用的标签
   * @returns {Promise<Object>} 清理结果
   */
  async cleanupUnusedTags() {
    try {
      const deletedCount = this.tagDAO.cleanupUnusedTags();
      this.emit('tags-cleaned', deletedCount);
      return {
        success: true,
        data: { deletedCount }
      };
    } catch (error) {
      console.error('清理标签失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 重新计算标签使用次数
   * 基于实际存在的笔记重新统计标签使用次数
   * @returns {Promise<Object>} 重新计算结果
   */
  async recalculateTagUsage() {
    try {
      const updatedCount = this.tagDAO.recalculateTagUsage();
      this.emit('tags-recalculated', updatedCount);
      return {
        success: true,
        data: { updatedCount }
      };
    } catch (error) {
      console.error('重新计算标签使用次数失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 删除标签
   * @param {string} tagName - 标签名称
   * @returns {Promise<Object>} 删除结果
   */
  async deleteTag(tagName) {
    try {
      const validation = TagService.validateTagName(tagName);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }
      
      const deleted = this.tagDAO.deleteByName(validation.tagName);
      if (deleted) {
        this.emit('tag-deleted', validation.tagName);
      }
      
      return {
        success: deleted,
        data: { deleted }
      };
    } catch (error) {
      console.error('删除标签失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = TagService;