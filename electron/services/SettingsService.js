const SettingDAO = require('../dao/SettingDAO');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

// 尝试加载 Electron，如果失败则使用 null（独立运行模式）
let app = null;
try {
  const electron = require('electron');
  app = electron.app;
} catch (e) {
  // 独立运行模式（如 MCP Server），不依赖 Electron
}

// 获取用户数据目录
const getUserDataPath = () => {
  if (app) {
    return app.getPath('userData');
  }
  // 独立运行模式：使用标准路径
  const platform = process.platform;
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || homeDir, 'flashnote');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'flashnote');
  } else {
    return path.join(homeDir, '.config', 'flashnote');
  }
};

class SettingsService extends EventEmitter {
  constructor() {
    super();
    this.settingDAO = new SettingDAO();
    this.cache = new Map(); // 设置缓存
    this.loadCache();
  }

  /**
   * 加载设置到缓存
   */
  async loadCache() {
    try {
      const settings = this.settingDAO.getAll();
      this.cache.clear();
      
      for (const [key, setting] of Object.entries(settings)) {
        this.cache.set(key, setting.value);
      }
      
      console.log('设置缓存加载完成');
    } catch (error) {
      console.error('加载设置缓存失败:', error);
    }
  }

  /**
   * 获取单个设置
   */
  async getSetting(key) {
    try {
      // 优先从缓存获取
      if (this.cache.has(key)) {
        return {
          success: true,
          data: this.cache.get(key)
        };
      }
      
      // 从数据库获取
      const setting = this.settingDAO.get(key);
      if (!setting) {
        return {
          success: false,
          error: '设置不存在'
        };
      }
      
      // 更新缓存
      this.cache.set(key, setting.value);
      
      return {
        success: true,
        data: setting.value
      };
    } catch (error) {
      console.error('获取设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取多个设置
   */
  async getSettings(keys) {
    try {
      const result = {};
      const missingKeys = [];
      
      // 先从缓存获取
      for (const key of keys) {
        if (this.cache.has(key)) {
          result[key] = this.cache.get(key);
        } else {
          missingKeys.push(key);
        }
      }
      
      // 从数据库获取缺失的设置
      if (missingKeys.length > 0) {
        const dbSettings = this.settingDAO.getMultiple(missingKeys);
        for (const [key, setting] of Object.entries(dbSettings)) {
          result[key] = setting.value;
          this.cache.set(key, setting.value);
        }
      }
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('获取多个设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取所有设置
   */
  async getAllSettings() {
    try {
      const settings = this.settingDAO.getAll();
      const result = {};
      
      for (const [key, setting] of Object.entries(settings)) {
        result[key] = setting.value;
        this.cache.set(key, setting.value);
      }
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('获取所有设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 设置单个配置
   */
  async setSetting(key, value, type = 'string', description = '') {
    try {
      // 验证值
      if (!this.settingDAO.validateValue(value, type)) {
        return {
          success: false,
          error: `无效的${type}类型值`
        };
      }
      
      const setting = this.settingDAO.set(key, value, type, description);
      
      // 更新缓存
      this.cache.set(key, setting.value);
      
      // 发送设置变更事件
      this.emit('setting-changed', { key, value: setting.value, oldValue: this.cache.get(key) });
      
      return {
        success: true,
        data: setting.value
      };
    } catch (error) {
      console.error('设置配置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 批量设置配置
   */
  async setSettings(settings) {
    try {
      const oldValues = {};
      
      // 记录旧值
      for (const key of Object.keys(settings)) {
        oldValues[key] = this.cache.get(key);
      }
      
      const result = this.settingDAO.setMultiple(settings);
      
      // 更新缓存
      for (const [key, setting] of Object.entries(result)) {
        this.cache.set(key, setting.value);
      }
      
      // 发送批量设置变更事件
      this.emit('settings-changed', { settings: result, oldValues });
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('批量设置配置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 删除设置
   */
  async deleteSetting(key) {
    try {
      const oldValue = this.cache.get(key);
      const success = this.settingDAO.delete(key);
      
      if (!success) {
        return {
          success: false,
          error: '设置不存在'
        };
      }
      
      // 从缓存中移除
      this.cache.delete(key);
      
      this.emit('setting-deleted', { key, oldValue });
      
      return {
        success: true,
        message: '设置已删除'
      };
    } catch (error) {
      console.error('删除设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 重置所有设置为默认值
   */
  async resetToDefaults() {
    try {
      const oldSettings = { ...Object.fromEntries(this.cache) };
      
      const defaultSettings = this.settingDAO.resetToDefaults();
      
      // 重新加载缓存
      await this.loadCache();
      
      this.emit('settings-reset', { oldSettings, newSettings: defaultSettings });
      
      return {
        success: true,
        data: defaultSettings
      };
    } catch (error) {
      console.error('重置设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取主题相关设置
   */
  async getThemeSettings() {
    try {
      const themeKeys = ['theme_mode', 'primary_color', 'font_size', 'font_family'];
      return await this.getSettings(themeKeys);
    } catch (error) {
      console.error('获取主题设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 设置主题
   */
  async setTheme(themeMode, primaryColor) {
    try {
      const settings = {};
      
      if (themeMode !== undefined) {
        settings.theme_mode = { value: themeMode, type: 'string', description: '主题模式' };
      }
      
      if (primaryColor !== undefined) {
        settings.primary_color = { value: primaryColor, type: 'string', description: '主色调' };
      }
      
      return await this.setSettings(settings);
    } catch (error) {
      console.error('设置主题失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取窗口相关设置
   */
  async getWindowSettings() {
    try {
      const windowKeys = ['window_width', 'window_height', 'window_x', 'window_y'];
      return await this.getSettings(windowKeys);
    } catch (error) {
      console.error('获取窗口设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 保存窗口状态
   */
  async saveWindowState(bounds) {
    try {
      const settings = {
        window_width: { value: bounds.width, type: 'number', description: '窗口宽度' },
        window_height: { value: bounds.height, type: 'number', description: '窗口高度' },
        window_x: { value: bounds.x, type: 'number', description: '窗口X位置' },
        window_y: { value: bounds.y, type: 'number', description: '窗口Y位置' }
      };
      
      return await this.setSettings(settings);
    } catch (error) {
      console.error('保存窗口状态失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取编辑器相关设置
   */
  async getEditorSettings() {
    try {
      const editorKeys = [
        'auto_save', 'auto_save_interval', 'show_line_numbers', 
        'word_wrap', 'spell_check', 'font_size', 'font_family'
      ];
      return await this.getSettings(editorKeys);
    } catch (error) {
      console.error('获取编辑器设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 导出设置
   */
  async exportSettings() {
    try {
      const exportData = this.settingDAO.export();
      
      return {
        success: true,
        data: exportData,
        filename: `flashnote-settings-${new Date().toISOString().split('T')[0]}.json`
      };
    } catch (error) {
      console.error('导出设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 导入设置
   */
  async importSettings(data) {
    try {
      const oldSettings = { ...Object.fromEntries(this.cache) };
      
      const result = this.settingDAO.import(data);
      
      // 重新加载缓存
      await this.loadCache();
      
      this.emit('settings-imported', { oldSettings, newSettings: result });
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('导入设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 搜索设置
   */
  async searchSettings(query) {
    try {
      const settings = this.settingDAO.search(query);
      
      return {
        success: true,
        data: settings
      };
    } catch (error) {
      console.error('搜索设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取设置统计信息
   */
  async getSettingsStats() {
    try {
      const stats = this.settingDAO.getStats();
      
      return {
        success: true,
        data: {
          ...stats,
          cacheSize: this.cache.size
        }
      };
    } catch (error) {
      console.error('获取设置统计失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 监听设置变更
   */
  onSettingChanged(callback) {
    this.on('setting-changed', callback);
  }

  /**
   * 监听批量设置变更
   */
  onSettingsChanged(callback) {
    this.on('settings-changed', callback);
  }

  /**
   * 监听设置重置
   */
  onSettingsReset(callback) {
    this.on('settings-reset', callback);
  }

  /**
   * 获取缓存的设置值（同步）
   */
  getCachedSetting(key, defaultValue = null) {
    return this.cache.get(key) || defaultValue;
  }

  /**
   * 检查设置是否存在
   */
  hasSetting(key) {
    return this.cache.has(key) || this.settingDAO.exists(key);
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 重新加载缓存
   */
  async reloadCache() {
    await this.loadCache();
    this.emit('cache-reloaded');
  }

  /**
   * 获取应用数据目录路径
   */
  getAppDataPath() {
    return getUserDataPath();
  }

  /**
   * 获取设置文件路径
   */
  getSettingsPath() {
    return path.join(this.getAppDataPath(), 'settings.json');
  }

  /**
   * 备份设置到文件
   */
  async backupSettings() {
    try {
      const exportData = await this.exportSettings();
      if (!exportData.success) {
        return exportData;
      }
      
      const backupPath = path.join(
        this.getAppDataPath(), 
        'backups', 
        `settings-backup-${Date.now()}.json`
      );
      
      // 确保备份目录存在
      const backupDir = path.dirname(backupPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      fs.writeFileSync(backupPath, JSON.stringify(exportData.data, null, 2));
      
      return {
        success: true,
        data: {
          backupPath,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('备份设置失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 选择壁纸文件
   */
  async selectWallpaper() {
    const { dialog } = require('electron');
    
    try {
      const result = await dialog.showOpenDialog({
        title: '选择壁纸',
        filters: [
          {
            name: '图片文件',
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
          }
        ],
        properties: ['openFile']
      });
      
      if (result.canceled || !result.filePaths.length) {
        return {
          success: false,
          error: '用户取消选择'
        };
      }
      
      return {
        success: true,
        data: result.filePaths[0]
      };
    } catch (error) {
      console.error('选择壁纸失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SettingsService;