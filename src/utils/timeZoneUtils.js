/**
 * 前端时区处理工具类
 * 与后端TimeZoneUtils配合，处理前端的时区转换
 */
class TimeZoneUtils {
  /**
   * 将本地日期时间转换为UTC ISO字符串（发送给后端）
   * @param {string} dateString - 日期字符串，格式如 '2024-01-15'
   * @param {string} timeString - 时间字符串，格式如 '14:30' 或空字符串
   * @returns {string|null} UTC ISO字符串
   */
  static toUTC(dateString, timeString = '') {
    if (!dateString) return null;
    
    try {
      // 如果没有时间，默认为 00:00:00
      const time = timeString || '00:00';
      const localDateTime = `${dateString}T${time}:00`;
      
      // 创建本地时间的Date对象
      const localDate = new Date(localDateTime);
      
      // 检查日期是否有效
      if (isNaN(localDate.getTime())) {
        console.warn('无效的日期时间:', { dateString, timeString });
        return null;
      }
      
      // 返回UTC ISO字符串
      return localDate.toISOString();
    } catch (error) {
      console.error('转换为UTC时出错:', error, { dateString, timeString });
      return null;
    }
  }

  /**
   * 将UTC ISO字符串转换为本地日期时间（从后端接收）
   * @param {string} utcISOString - UTC ISO字符串
   * @returns {Object} { date: '2024-01-15', time: '14:30' }
   */
  static fromUTC(utcISOString) {
    if (!utcISOString) return { date: '', time: '' };
    
    try {
      const utcDate = new Date(utcISOString);
      
      // 检查日期是否有效
      if (isNaN(utcDate.getTime())) {
        console.warn('无效的UTC ISO字符串:', utcISOString);
        return { date: '', time: '' };
      }
      
      // 获取本地时间的年月日时分秒
      const year = utcDate.getFullYear();
      const month = String(utcDate.getMonth() + 1).padStart(2, '0');
      const day = String(utcDate.getDate()).padStart(2, '0');
      const hours = String(utcDate.getHours()).padStart(2, '0');
      const minutes = String(utcDate.getMinutes()).padStart(2, '0');
      
      const date = `${year}-${month}-${day}`;
      const time = `${hours}:${minutes}`;
      
      return { date, time };
    } catch (error) {
      console.error('从UTC转换时出错:', error, utcISOString);
      return { date: '', time: '' };
    }
  }

  /**
   * 检查UTC时间是否已过期
   * @param {string} utcISOString - UTC ISO时间字符串
   * @returns {boolean} 是否已过期
   */
  static isOverdue(utcISOString) {
    if (!utcISOString) return false;
    
    try {
      const dueDate = new Date(utcISOString);
      const now = new Date();
      return dueDate < now;
    } catch (error) {
      console.error('检查是否过期时出错:', error, utcISOString);
      return false;
    }
  }

  /**
   * 检查UTC时间是否是今天
   * @param {string} utcISOString - UTC ISO时间字符串
   * @returns {boolean} 是否是今天
   */
  static isToday(utcISOString) {
    if (!utcISOString) return false;
    
    try {
      const date = new Date(utcISOString);
      const now = new Date();
      
      return date.getFullYear() === now.getFullYear() &&
             date.getMonth() === now.getMonth() &&
             date.getDate() === now.getDate();
    } catch (error) {
      console.error('检查是否今天时出错:', error, utcISOString);
      return false;
    }
  }

  /**
   * 格式化UTC时间为显示字符串
   * @param {string} utcISOString - UTC ISO时间字符串
   * @param {Object} options - 格式化选项
   * @returns {string} 格式化后的时间字符串
   */
  static formatForDisplay(utcISOString, options = {}) {
    if (!utcISOString) return '';
    
    try {
      const date = new Date(utcISOString);
      const now = new Date();
      
      const {
        showTime = true,
        showDate = true,
        shortFormat = false
      } = options;
      
      // 检查是否是今天
      if (this.isToday(utcISOString)) {
        if (showTime) {
          return `今天 ${date.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}`;
        } else {
          return '今天';
        }
      }
      
      // 检查是否是明天
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (date.getFullYear() === tomorrow.getFullYear() &&
          date.getMonth() === tomorrow.getMonth() &&
          date.getDate() === tomorrow.getDate()) {
        if (showTime) {
          return `明天 ${date.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}`;
        } else {
          return '明天';
        }
      }
      
      // 检查是否是昨天
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.getFullYear() === yesterday.getFullYear() &&
          date.getMonth() === yesterday.getMonth() &&
          date.getDate() === yesterday.getDate()) {
        if (showTime) {
          return `昨天 ${date.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}`;
        } else {
          return '昨天';
        }
      }
      
      // 其他日期
      if (shortFormat) {
        if (showTime) {
          return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        } else {
          return date.toLocaleDateString('zh-CN', {
            month: '2-digit',
            day: '2-digit'
          });
        }
      } else {
        if (showTime) {
          return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        } else {
          return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
        }
      }
    } catch (error) {
      console.error('格式化时间显示时出错:', error, utcISOString);
      return '';
    }
  }

  /**
   * 检查时间字符串是否包含时间部分（不是00:00:00）
   * @param {string} utcISOString - UTC ISO时间字符串
   * @returns {boolean} 是否包含有效时间
   */
  static hasTime(utcISOString) {
    if (!utcISOString) return false;
    
    try {
      const date = new Date(utcISOString);
      return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
    } catch (error) {
      console.error('检查是否有时间时出错:', error, utcISOString);
      return false;
    }
  }

  /**
   * 获取今天的日期字符串（本地时区）
   * @returns {string} 格式如 '2024-01-15'
   */
  static getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 调试用：打印时间信息
   * @param {string} label - 标签
   * @param {string} utcISOString - UTC ISO字符串
   */
  static debug(label, utcISOString) {
    if (!utcISOString) {
      console.log(`[Frontend TimeZone Debug] ${label}: null/empty`);
      return;
    }
    
    try {
      const utcDate = new Date(utcISOString);
      const { date, time } = this.fromUTC(utcISOString);
      
      console.log(`[Frontend TimeZone Debug] ${label}:`);
      console.log(`  - UTC ISO: ${utcISOString}`);
      console.log(`  - UTC Date: ${utcDate.toUTCString()}`);
      console.log(`  - Local Date: ${utcDate.toString()}`);
      console.log(`  - Parsed Date: ${date}`);
      console.log(`  - Parsed Time: ${time}`);
      console.log(`  - Is Today: ${this.isToday(utcISOString)}`);
      console.log(`  - Is Overdue: ${this.isOverdue(utcISOString)}`);
      console.log(`  - Has Time: ${this.hasTime(utcISOString)}`);
      console.log(`  - Display: ${this.formatForDisplay(utcISOString)}`);
    } catch (error) {
      console.error(`[Frontend TimeZone Debug] ${label} - Error:`, error);
    }
  }
}

export default TimeZoneUtils;