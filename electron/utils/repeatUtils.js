const { addDays, addWeeks, addMonths, addYears, format, parseISO, isValid } = require('date-fns');

/**
 * 重复事项工具类
 */
class RepeatUtils {
  /**
   * 计算下次重复日期
   * @param {string} currentDate - 当前日期 (ISO格式)
   * @param {string} repeatType - 重复类型: 'daily', 'weekly', 'monthly', 'yearly', 'custom'
   * @param {number} repeatInterval - 重复间隔
   * @param {string} repeatDays - 重复天数 (用于weekly类型，格式: '1,2,3' 表示周一、周二、周三)
   * @returns {string|null} 下次重复日期 (ISO格式) 或 null
   */
  static calculateNextDueDate(currentDate, repeatType, repeatInterval = 1, repeatDays = '') {
    if (!currentDate || repeatType === 'none') {
      return null;
    }

    try {
      const date = typeof currentDate === 'string' ? parseISO(currentDate) : currentDate;
      if (!isValid(date)) {
        return null;
      }

      switch (repeatType) {
        case 'daily':
          return format(addDays(date, repeatInterval), 'yyyy-MM-dd\'T\'HH:mm:ss');

        case 'weekly':
          if (repeatDays) {
            // 自定义周重复
            return this.calculateNextWeeklyDate(date, repeatDays, repeatInterval);
          } else {
            // 简单周重复
            return format(addWeeks(date, repeatInterval), 'yyyy-MM-dd\'T\'HH:mm:ss');
          }

        case 'monthly':
          return format(addMonths(date, repeatInterval), 'yyyy-MM-dd\'T\'HH:mm:ss');

        case 'yearly':
          return format(addYears(date, repeatInterval), 'yyyy-MM-dd\'T\'HH:mm:ss');

        case 'custom':
          // 自定义重复逻辑
          return this.calculateCustomRepeat(date, repeatDays, repeatInterval);

        default:
          return null;
      }
    } catch (error) {
      console.error('计算下次重复日期失败:', error);
      return null;
    }
  }

  /**
   * 计算下次周重复日期
   * @param {Date} currentDate - 当前日期
   * @param {string} repeatDays - 重复天数 '1,2,3' (1=周一, 2=周二, ..., 7=周日)
   * @param {number} repeatInterval - 重复间隔（周数）
   * @returns {string} 下次重复日期
   */
  static calculateNextWeeklyDate(currentDate, repeatDays, repeatInterval = 1) {
    const days = repeatDays.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 7);
    if (days.length === 0) {
      return format(addWeeks(currentDate, repeatInterval), 'yyyy-MM-dd\'T\'HH:mm:ss');
    }

    // 将周日从7转换为0，其他天数保持不变 (JavaScript Date.getDay()格式: 0=周日, 1=周一, ..., 6=周六)
    const jsDays = days.map(d => d === 7 ? 0 : d);
    const currentDay = currentDate.getDay();
    
    // 查找本周内下一个重复日（包括今天之后的日期）
    const nextDayInWeek = jsDays.find(day => day > currentDay);
    
    if (nextDayInWeek !== undefined) {
      // 本周内有下一个重复日
      const daysToAdd = nextDayInWeek - currentDay;
      return format(addDays(currentDate, daysToAdd), 'yyyy-MM-dd\'T\'HH:mm:ss');
    } else {
      // 本周内没有下一个重复日，找下个重复周期的第一个重复日
      const firstDayNextCycle = Math.min(...jsDays);
      // 计算到下一个重复周期第一天的天数
      let daysToAdd = 7 - currentDay + firstDayNextCycle;
      // 如果重复间隔大于1，需要额外跳过几周
      if (repeatInterval > 1) {
        daysToAdd += (repeatInterval - 1) * 7;
      }
      return format(addDays(currentDate, daysToAdd), 'yyyy-MM-dd\'T\'HH:mm:ss');
    }
  }

  /**
   * 计算自定义重复日期
   * @param {Date} currentDate - 当前日期
   * @param {string} repeatDays - 自定义重复规则
   * @param {number} repeatInterval - 重复间隔
   * @returns {string} 下次重复日期
   */
  static calculateCustomRepeat(currentDate, repeatDays, repeatInterval) {
    // 这里可以实现更复杂的自定义重复逻辑
    // 目前简单处理为按天重复
    return format(addDays(currentDate, repeatInterval), 'yyyy-MM-dd\'T\'HH:mm:ss');
  }

  /**
   * 验证重复设置是否有效
   * @param {string} repeatType - 重复类型
   * @param {number} repeatInterval - 重复间隔
   * @param {string} repeatDays - 重复天数
   * @returns {boolean} 是否有效
   */
  static validateRepeatSettings(repeatType, repeatInterval, repeatDays) {
    if (repeatType === 'none') {
      return true;
    }

    if (!repeatType || repeatInterval < 1) {
      return false;
    }

    if (repeatType === 'weekly' && repeatDays) {
      const days = repeatDays.split(',').map(d => parseInt(d.trim()));
      return days.every(d => d >= 1 && d <= 7);
    }

    return ['daily', 'weekly', 'monthly', 'yearly', 'custom'].includes(repeatType);
  }

  /**
   * 获取重复类型的显示文本
   * @param {string} repeatType - 重复类型
   * @param {number} repeatInterval - 重复间隔
   * @param {string} repeatDays - 重复天数
   * @returns {string} 显示文本
   */
  static getRepeatDisplayText(repeatType, repeatInterval = 1, repeatDays = '') {
    if (repeatType === 'none') {
      return '不重复';
    }

    const intervalText = repeatInterval > 1 ? `每${repeatInterval}` : '每';

    switch (repeatType) {
      case 'daily':
        return `${intervalText}天`;
      
      case 'weekly':
        if (repeatDays) {
          const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
          const days = repeatDays.split(',').map(d => parseInt(d.trim()));
          const dayTexts = days.map(d => dayNames[d]).join('、');
          return `${intervalText}周的${dayTexts}`;
        }
        return `${intervalText}周`;
      
      case 'monthly':
        return `${intervalText}月`;
      
      case 'yearly':
        return `${intervalText}年`;
      
      case 'custom':
        return '自定义重复';
      
      default:
        return '未知重复类型';
    }
  }

  /**
   * 解析重复天数字符串为数组
   * @param {string} repeatDays - 重复天数字符串 '1,2,3'
   * @returns {number[]} 天数数组
   */
  static parseRepeatDays(repeatDays) {
    if (!repeatDays) return [];
    return repeatDays.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 7);
  }

  /**
   * 将天数数组转换为字符串
   * @param {number[]} days - 天数数组
   * @returns {string} 天数字符串
   */
  static formatRepeatDays(days) {
    return days.filter(d => d >= 1 && d <= 7).join(',');
  }
}

module.exports = RepeatUtils;