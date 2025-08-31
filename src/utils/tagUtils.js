/**
 * 标签工具类
 * 遵循DRY原则，提供统一的标签处理函数
 * 可在前端组件中复用
 */

/**
 * 解析标签字符串为数组
 * @param {string|Array} tags - 标签字符串或数组
 * @returns {Array} 标签数组
 */
export const parseTags = (tags) => {
  if (Array.isArray(tags)) {
    return tags.map(tag => tag.toString().trim()).filter(tag => tag);
  }
  
  if (typeof tags === 'string' && tags.trim()) {
    return tags.split(',').map(tag => tag.trim()).filter(tag => tag);
  }
  
  return [];
};

/**
 * 格式化标签数组为字符串
 * @param {Array} tags - 标签数组
 * @returns {string} 标签字符串
 */
export const formatTags = (tags) => {
  if (!Array.isArray(tags)) {
    return '';
  }
  
  return tags.map(tag => tag.toString().trim()).filter(tag => tag).join(',');
};

/**
 * 标准化标签数据格式（用于前端显示）
 * @param {string|Array} tags - 标签数据
 * @returns {Array} 标准化的标签数组
 */
export const normalizeTags = (tags) => {
  return parseTags(tags);
};

/**
 * 验证标签名称
 * @param {string} tagName - 标签名称
 * @returns {Object} 验证结果
 */
export const validateTagName = (tagName) => {
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
};

/**
 * 批量验证标签
 * @param {Array} tags - 标签数组
 * @returns {Object} 验证结果
 */
export const validateTags = (tags) => {
  const parsedTags = parseTags(tags);
  const validTags = [];
  const errors = [];
  
  for (const tag of parsedTags) {
    const validation = validateTagName(tag);
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
};

/**
 * 从标签数组中移除重复项
 * @param {Array} tags - 标签数组
 * @returns {Array} 去重后的标签数组
 */
export const deduplicateTags = (tags) => {
  const parsedTags = parseTags(tags);
  return [...new Set(parsedTags)];
};

/**
 * 合并多个标签数组
 * @param {...Array} tagArrays - 多个标签数组
 * @returns {Array} 合并后的标签数组
 */
export const mergeTags = (...tagArrays) => {
  const allTags = [];
  
  for (const tags of tagArrays) {
    allTags.push(...parseTags(tags));
  }
  
  return deduplicateTags(allTags);
};

/**
 * 检查标签是否匹配搜索查询
 * @param {Array} tags - 标签数组
 * @param {string} query - 搜索查询
 * @returns {boolean} 是否匹配
 */
export const tagsMatchQuery = (tags, query) => {
  if (!query || !query.trim()) {
    return true;
  }
  
  const parsedTags = parseTags(tags);
  const lowerQuery = query.toLowerCase().trim();
  
  return parsedTags.some(tag => 
    tag.toLowerCase().includes(lowerQuery)
  );
};

/**
 * 高亮标签中的匹配文本
 * @param {string} tagName - 标签名称
 * @param {string} query - 搜索查询
 * @returns {string} 高亮后的HTML字符串
 */
export const highlightTagMatch = (tagName, query) => {
  if (!query || !query.trim()) {
    return tagName;
  }
  
  const regex = new RegExp(`(${query.trim()})`, 'gi');
  return tagName.replace(regex, '<mark>$1</mark>');
};

/**
 * 获取标签的显示颜色（基于标签名称生成一致的颜色）
 * @param {string} tagName - 标签名称
 * @returns {string} 颜色值
 */
export const getTagColor = (tagName) => {
  if (!tagName) return '#1976d2';
  
  // 基于标签名称生成一致的颜色
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // 生成HSL颜色，确保足够的饱和度和亮度
  const hue = Math.abs(hash) % 360;
  const saturation = 60 + (Math.abs(hash) % 20); // 60-80%
  const lightness = 45 + (Math.abs(hash) % 10);  // 45-55%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/**
 * 格式化标签显示文本
 * @param {Array} tags - 标签数组
 * @param {number} maxDisplay - 最大显示数量
 * @returns {Object} 格式化结果
 */
export const formatTagsDisplay = (tags, maxDisplay = 3) => {
  const parsedTags = parseTags(tags);
  
  if (parsedTags.length === 0) {
    return {
      displayTags: [],
      hiddenCount: 0,
      hasMore: false
    };
  }
  
  const displayTags = parsedTags.slice(0, maxDisplay);
  const hiddenCount = Math.max(0, parsedTags.length - maxDisplay);
  
  return {
    displayTags,
    hiddenCount,
    hasMore: hiddenCount > 0,
    allTags: parsedTags
  };
};

export default {
  parseTags,
  formatTags,
  normalizeTags,
  validateTagName,
  validateTags,
  deduplicateTags,
  mergeTags,
  tagsMatchQuery,
  highlightTagMatch,
  getTagColor,
  formatTagsDisplay
};