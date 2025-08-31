const { globalShortcut, BrowserWindow } = require('electron');
const { DEFAULT_SHORTCUTS } = require('../utils/shortcutUtils');

class ShortcutService {
  constructor() {
    this.registeredShortcuts = new Map();
    this.mainWindow = null;
  }

  /**
   * 设置主窗口引用
   * @param {BrowserWindow} window 
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }

  /**
   * 注册所有全局快捷键
   * @param {Object} shortcuts 快捷键配置对象
   * @returns {Object} 注册结果统计
   */
  async registerAllShortcuts(shortcuts = DEFAULT_SHORTCUTS) {
    const stats = {
      total: 0,
      registered: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    try {
      // 先清除所有已注册的快捷键
      this.unregisterAllShortcuts();

      console.log('开始注册快捷键，配置数据:', JSON.stringify(shortcuts, null, 2));

      // 注册全局快捷键
      for (const [shortcutId, config] of Object.entries(shortcuts)) {
        stats.total++;
        
        console.log(`检查快捷键 ${shortcutId}:`, {
          type: config.type,
          currentKey: config.currentKey,
          action: config.action
        });
        
        if (config.type === 'global' && config.currentKey) {
          try {
            const success = await this.registerShortcut(shortcutId, config.currentKey, config.action);
            if (success) {
              stats.registered++;
            } else {
              stats.failed++;
              stats.errors.push(`${shortcutId}: 注册失败`);
            }
          } catch (error) {
            stats.failed++;
            stats.errors.push(`${shortcutId}: ${error.message}`);
            console.error(`注册快捷键 ${shortcutId} 时发生错误:`, error);
          }
        } else {
          stats.skipped++;
          console.log(`跳过快捷键 ${shortcutId}: type=${config.type}, currentKey=${config.currentKey}`);
        }
      }

      console.log(`快捷键注册完成统计:`, {
        总数: stats.total,
        成功: stats.registered,
        跳过: stats.skipped,
        失败: stats.failed
      });

      if (stats.errors.length > 0) {
        console.warn('注册失败的快捷键:', stats.errors);
      }

      return stats;
    } catch (error) {
      console.error('注册快捷键过程中发生严重错误:', error);
      stats.errors.push(`严重错误: ${error.message}`);
      return stats;
    }
  }

  /**
   * 注册单个全局快捷键
   * @param {string} shortcutId 快捷键ID
   * @param {string} accelerator 快捷键组合
   * @param {string} action 动作类型
   */
  async registerShortcut(shortcutId, accelerator, action) {
    if (!accelerator) {
      console.warn(`快捷键 ${shortcutId} 的accelerator为空，跳过注册`);
      return false;
    }

    try {
      // 验证快捷键字符串格式
      if (!this.validateAccelerator(accelerator)) {
        throw new Error(`无效的快捷键格式: ${accelerator}`);
      }

      // 如果已经注册了这个快捷键，先取消注册
      if (this.registeredShortcuts.has(shortcutId)) {
        const oldAccelerator = this.registeredShortcuts.get(shortcutId);
        try {
          globalShortcut.unregister(oldAccelerator);
        } catch (unregError) {
          console.warn(`取消注册旧快捷键失败: ${oldAccelerator}`, unregError);
        }
      }

      // 检查快捷键是否已被当前应用注册
      if (globalShortcut.isRegistered(accelerator)) {
        console.warn(`快捷键 ${accelerator} 已被当前应用注册`);
        return false;
      }

      // 注册新的快捷键
      const success = globalShortcut.register(accelerator, () => {
        try {
          this.handleShortcutAction(action, shortcutId);
        } catch (actionError) {
          console.error(`执行快捷键动作失败: ${shortcutId}`, actionError);
        }
      });

      if (success) {
        this.registeredShortcuts.set(shortcutId, accelerator);
        console.log(`快捷键 ${accelerator} (${shortcutId}) 注册成功`);
        return true;
      } else {
        console.error(`快捷键 ${accelerator} (${shortcutId}) 注册失败，可能已被其他应用占用`);
        return false;
      }
    } catch (error) {
      console.error(`注册快捷键 ${accelerator} 失败:`, error);
      return false;
    }
  }

  /**
   * 更新单个快捷键
   * @param {string} shortcutId 快捷键ID
   * @param {string} newAccelerator 新的快捷键组合
   * @param {string} action 动作类型
   */
  async updateShortcut(shortcutId, newAccelerator, action) {
    try {
      await this.registerShortcut(shortcutId, newAccelerator, action);
    } catch (error) {
      console.error(`更新快捷键 ${shortcutId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 取消注册单个快捷键
   * @param {string} shortcutId 快捷键ID
   */
  unregisterShortcut(shortcutId) {
    try {
      if (this.registeredShortcuts.has(shortcutId)) {
        const accelerator = this.registeredShortcuts.get(shortcutId);
        globalShortcut.unregister(accelerator);
        this.registeredShortcuts.delete(shortcutId);
        console.log(`快捷键 ${accelerator} (${shortcutId}) 已取消注册`);
      }
    } catch (error) {
      console.error(`取消注册快捷键 ${shortcutId} 失败:`, error);
    }
  }

  /**
   * 取消注册所有快捷键
   */
  unregisterAllShortcuts() {
    try {
      globalShortcut.unregisterAll();
      this.registeredShortcuts.clear();
      console.log('所有全局快捷键已取消注册');
    } catch (error) {
      console.error('取消注册所有快捷键失败:', error);
    }
  }

  /**
   * 处理快捷键动作
   * @param {string} action 动作类型
   * @param {string} shortcutId 快捷键ID
   */
  handleShortcutAction(action, shortcutId) {
    try {
      switch (action) {
        case 'new-note':
          this.handleNewNote();
          break;
        case 'new-todo':
          this.handleNewTodo();
          break;
        case 'quick-input':
          this.handleQuickInput();
          break;
        case 'quit-app':
          this.handleQuitApp();
          break;
        case 'show-hide-window':
          this.handleShowHideWindow();
          break;
        case 'open-settings':
          this.handleOpenSettings();
          break;
        default:
          console.warn(`未知的快捷键动作: ${action}`);
      }
    } catch (error) {
      console.error(`处理快捷键动作 ${action} 失败:`, error);
    }
  }

  /**
   * 处理新建笔记动作
   */
  handleNewNote() {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('create-new-note');
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 处理新建待办动作
   */
  handleNewTodo() {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('create-new-todo');
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 处理快速输入动作
   */
  handleQuickInput() {
    // TODO: 实现快速输入窗口
    console.log('快速输入功能待实现');
    if (this.mainWindow) {
      this.mainWindow.webContents.send('quick-input');
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 处理退出应用动作
   */
  handleQuitApp() {
    const { app } = require('electron');
    app.quit();
  }

  /**
   * 处理显示/隐藏窗口动作
   */
  handleShowHideWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible() && this.mainWindow.isFocused()) {
        this.mainWindow.hide();
      } else {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    }
  }

  /**
   * 处理打开设置动作
   */
  handleOpenSettings() {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('open-settings');
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 验证快捷键字符串格式
   * @param {string} accelerator 快捷键组合
   * @returns {boolean} 是否为有效格式
   */
  validateAccelerator(accelerator) {
    if (!accelerator || typeof accelerator !== 'string') {
      return false;
    }

    // 基本格式检查：必须包含+号分隔的组合
    const parts = accelerator.split('+');
    if (parts.length < 1) {
      return false;
    }

    // 检查是否包含有效的修饰键和主键
    const validModifiers = ['Ctrl', 'Alt', 'Shift', 'Meta', 'Cmd', 'CmdOrCtrl', 'Command', 'Control'];
    const validKeys = /^[A-Za-z0-9]$|^F[1-9]$|^F1[0-2]$|^(Space|Tab|Backspace|Delete|Enter|Return|Esc|Escape|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert)$/;

    const lastPart = parts[parts.length - 1];
    
    // 最后一部分必须是有效的主键
    if (!validKeys.test(lastPart)) {
      return false;
    }

    // 检查修饰键（除了最后一个主键）
    for (let i = 0; i < parts.length - 1; i++) {
      if (!validModifiers.includes(parts[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查快捷键是否已被注册
   * @param {string} accelerator 快捷键组合
   * @returns {boolean}
   */
  isShortcutRegistered(accelerator) {
    return globalShortcut.isRegistered(accelerator);
  }

  /**
   * 获取所有已注册的快捷键
   * @returns {Map}
   */
  getRegisteredShortcuts() {
    return new Map(this.registeredShortcuts);
  }

  /**
   * 获取所有快捷键配置
   * @returns {Object} 快捷键配置对象
   */
  async getAllShortcuts() {
    try {
      const SettingsService = require('./SettingsService');
      const settingsService = new SettingsService();
      const result = await settingsService.getSetting('shortcuts');
      return result.success ? result.data : DEFAULT_SHORTCUTS;
    } catch (error) {
      console.error('获取快捷键配置失败:', error);
      return DEFAULT_SHORTCUTS;
    }
  }

  /**
   * 重置单个快捷键为默认值
   * @param {string} shortcutId 快捷键ID
   */
  async resetShortcut(shortcutId) {
    try {
      const defaultConfig = DEFAULT_SHORTCUTS[shortcutId];
      if (!defaultConfig) {
        throw new Error(`未找到快捷键配置: ${shortcutId}`);
      }

      // 获取当前所有快捷键配置
      const allShortcuts = await this.getAllShortcuts();
      
      // 重置指定快捷键
      allShortcuts[shortcutId] = {
        ...defaultConfig,
        currentKey: defaultConfig.defaultKey
      };

      // 保存配置
      const SettingsService = require('./SettingsService');
      const settingsService = new SettingsService();
      await settingsService.setSetting('shortcuts', allShortcuts);

      // 重新注册快捷键
      if (defaultConfig.type === 'global') {
        await this.registerShortcut(shortcutId, defaultConfig.defaultKey, defaultConfig.action);
      }

      console.log(`快捷键 ${shortcutId} 已重置为默认值`);
      return allShortcuts[shortcutId];
    } catch (error) {
      console.error(`重置快捷键 ${shortcutId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 重置所有快捷键为默认值
   * @param {Object} defaultShortcuts 默认快捷键配置
   */
  async resetAllShortcuts(defaultShortcuts = DEFAULT_SHORTCUTS) {
    try {
      // 保存默认配置到设置
      const SettingsService = require('./SettingsService');
      const settingsService = new SettingsService();
      await settingsService.setSetting('shortcuts', defaultShortcuts);

      // 重新注册所有快捷键
      await this.registerAllShortcuts(defaultShortcuts);
      console.log('所有快捷键已重置为默认值');
      return defaultShortcuts;
    } catch (error) {
      console.error('重置快捷键失败:', error);
      throw error;
    }
  }
}

module.exports = ShortcutService;