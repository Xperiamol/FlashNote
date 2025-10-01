const NutCloudSyncService = require('./NutCloudSyncService');
const OneDriveSyncService = require('./OneDriveSyncService');

/**
 * 云同步管理器
 * 统一管理多个云同步服务
 */
class CloudSyncManager {
  constructor() {
    this.services = new Map();
    this.activeService = null;
    this.isInitialized = false;
    
    // 注册可用的同步服务
    this.registerService('nutcloud', NutCloudSyncService);
    this.registerService('onedrive', OneDriveSyncService);
  }

  /**
   * 注册同步服务
   */
  registerService(name, ServiceClass) {
    this.services.set(name, {
      name,
      ServiceClass,
      instance: null
    });
  }

  /**
   * 初始化云同步管理器
   */
  async initialize() {
    try {
      // 加载配置，确定活跃的服务
      await this.loadConfiguration();
      
      if (this.activeService) {
        const service = this.services.get(this.activeService);
        if (service && !service.instance) {
          service.instance = new service.ServiceClass();
          await service.instance.initialize();
        }
      }
      
      this.isInitialized = true;
      console.log('云同步管理器初始化成功');
    } catch (error) {
      console.error('云同步管理器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 获取可用的同步服务列表
   */
  getAvailableServices() {
    return Array.from(this.services.keys()).map(name => ({
      name,
      displayName: this.getDisplayName(name),
      description: this.getDescription(name)
    }));
  }

  /**
   * 获取显示名称
   */
  getDisplayName(serviceName) {
    const displayNames = {
      nutcloud: '坚果云',
      onedrive: 'OneDrive'
    };
    return displayNames[serviceName] || serviceName;
  }

  /**
   * 获取服务描述
   */
  getDescription(serviceName) {
    const descriptions = {
      nutcloud: '基于WebDAV协议的云存储服务，支持自定义服务器',
      onedrive: 'Microsoft OneDrive云存储服务，集成Office 365'
    };
    return descriptions[serviceName] || '';
  }

  /**
   * 切换到指定的同步服务
   */
  async switchToService(serviceName, config = {}) {
    if (!this.services.has(serviceName)) {
      throw new Error(`未知的同步服务: ${serviceName}`);
    }

    try {
      // 停用当前服务
      if (this.activeService && this.activeService !== serviceName) {
        await this.disableCurrentService();
      }

      // 启用新服务
      const service = this.services.get(serviceName);
      if (!service.instance) {
        service.instance = new service.ServiceClass();
        await service.instance.initialize();
      }

      // 配置新服务
      let configResult;
      if (serviceName === 'nutcloud') {
        configResult = await service.instance.configure(config.username, config.password);
      } else if (serviceName === 'onedrive') {
        configResult = await service.instance.configure();
      }

      if (!configResult.success) {
        throw new Error(configResult.message);
      }

      // 启用服务
      await service.instance.enable(config);

      this.activeService = serviceName;
      await this.saveConfiguration();

      console.log(`已切换到 ${this.getDisplayName(serviceName)} 同步服务`);
      
      return {
        success: true,
        message: `${this.getDisplayName(serviceName)} 同步服务已启用`,
        service: serviceName
      };
    } catch (error) {
      console.error(`切换到 ${serviceName} 服务失败:`, error);
      return {
        success: false,
        message: error.message,
        service: serviceName
      };
    }
  }

  /**
   * 停用当前同步服务
   */
  async disableCurrentService() {
    if (!this.activeService) return;

    const service = this.services.get(this.activeService);
    if (service?.instance) {
      await service.instance.disable();
    }

    this.activeService = null;
    await this.saveConfiguration();
  }

  /**
   * 执行同步
   */
  async sync() {
    if (!this.activeService) {
      return { success: false, message: '没有启用的同步服务' };
    }

    const service = this.services.get(this.activeService);
    if (!service?.instance) {
      return { success: false, message: '同步服务未初始化' };
    }

    try {
      const result = await service.instance.sync();
      return result;
    } catch (error) {
      console.error('同步失败:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 获取当前同步状态
   */
  getStatus() {
    if (!this.activeService) {
      return {
        hasActiveService: false,
        activeService: null,
        status: null
      };
    }

    const service = this.services.get(this.activeService);
    if (!service?.instance) {
      return {
        hasActiveService: true,
        activeService: this.activeService,
        status: { isEnabled: false, message: '服务未初始化' }
      };
    }

    return {
      hasActiveService: true,
      activeService: this.activeService,
      activeServiceDisplayName: this.getDisplayName(this.activeService),
      status: service.instance.getStatus()
    };
  }

  /**
   * 获取活跃的同步服务实例
   */
  getActiveService() {
    if (!this.activeService) {
      return null;
    }

    const service = this.services.get(this.activeService);
    return service?.instance || null;
  }

  /**
   * 监听同步事件
   */
  onSyncEvent(event, callback) {
    if (!this.activeService) return;

    const service = this.services.get(this.activeService);
    if (service?.instance) {
      service.instance.on(event, callback);
    }
  }

  /**
   * 获取同步历史
   */
  getSyncHistory() {
    // TODO: 实现同步历史记录
    return [];
  }

  /**
   * 测试连接
   */
  async testConnection(serviceName, config) {
    if (!this.services.has(serviceName)) {
      throw new Error(`未知的同步服务: ${serviceName}`);
    }

    const ServiceClass = this.services.get(serviceName).ServiceClass;
    const testService = new ServiceClass();

    try {
      if (serviceName === 'nutcloud') {
        const result = await testService.configure(config.username, config.password);
        return result;
      } else if (serviceName === 'onedrive') {
        const result = await testService.configure();
        return result;
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * 强制停止同步
   */
  async forceStopSync() {
    if (!this.activeService) return;

    const service = this.services.get(this.activeService);
    if (service?.instance && service.instance.isSyncing) {
      // 这里需要实现强制停止的逻辑
      console.log('强制停止同步');
    }
  }

  /**
   * 获取冲突列表
   */
  getConflicts() {
    // TODO: 实现冲突管理
    return [];
  }

  /**
   * 解决指定冲突
   */
  async resolveConflict(conflictId, resolution) {
    // TODO: 实现冲突解决
  }

  /**
   * 加载配置
   */
  async loadConfiguration() {
    const path = require('path');
    const fs = require('fs');
    const { app } = require('electron');
    
    const configPath = path.join(app.getPath('userData'), 'cloud-sync-config.json');
    
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.activeService = config.activeService || null;
      } catch (error) {
        console.error('加载云同步配置失败:', error);
      }
    }
  }

  /**
   * 保存配置
   */
  async saveConfiguration() {
    const path = require('path');
    const fs = require('fs');
    const { app } = require('electron');
    
    const configPath = path.join(app.getPath('userData'), 'cloud-sync-config.json');
    const config = {
      activeService: this.activeService,
      lastUpdated: new Date().toISOString()
    };
    
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('保存云同步配置失败:', error);
    }
  }

  /**
   * 导出数据到文件
   */
  async exportData(filePath) {
    const CloudSyncService = require('./CloudSyncService');
    const tempService = new (class extends CloudSyncService {
      getAllLocalChanges() { return []; }
      insertRemoteItem() {}
      updateRemoteItem() {}
      deleteRemoteItem() {}
      resolveConflictWithLocal() {}
      resolveConflictWithRemote() {}
      resolveConflictWithMerge() {}
    })(null);

    const data = await tempService.getLocalData();
    const fs = require('fs');
    
    const exportData = {
      data,
      exportTime: new Date().toISOString(),
      version: '1.0'
    };

    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
    console.log('数据导出成功:', filePath);
  }

  /**
   * 从文件导入数据
   */
  async importData(filePath) {
    const fs = require('fs');
    
    if (!fs.existsSync(filePath)) {
      throw new Error('导入文件不存在');
    }

    const importData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // TODO: 实现数据导入逻辑
    console.log('数据导入成功');
  }
}

// 单例模式
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new CloudSyncManager();
  }
  return instance;
}

module.exports = {
  CloudSyncManager,
  getInstance
};