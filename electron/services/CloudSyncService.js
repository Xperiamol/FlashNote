const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

/**
 * 云同步服务基类
 * 提供通用的同步逻辑和接口定义
 */
class CloudSyncService {
  constructor(provider) {
    this.provider = provider; // 云存储提供商实例
    this.isEnabled = false;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncInterval = 5 * 60 * 1000; // 5分钟同步间隔
    this.autoSyncTimer = null;
    
    // 同步配置
    this.config = {
      autoSync: true,
      syncImages: false, // 图片同步开关，默认关闭(因为坚果云可能不稳定)
      conflictResolution: 'merge', // 'merge', 'local', 'remote'
      syncDeleted: true,
      encryptData: false
    };
    
    // 事件监听器
    this.listeners = {
      syncStart: [],
      syncProgress: [],
      syncComplete: [],
      syncError: [],
      conflictDetected: []
    };
  }

  /**
   * 初始化云同步服务
   */
  async initialize() {
    try {
      await this.loadConfig();
      if (this.isEnabled && this.config.autoSync) {
        await this.startAutoSync();
      }
      console.log('云同步服务初始化成功');
    } catch (error) {
      console.error('云同步服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启用云同步
   */
  async enable(config = {}) {
    try {
      // 验证云存储提供商连接
      await this.provider.authenticate();
      
      this.isEnabled = true;
      this.config = { ...this.config, ...config };
      
      await this.saveConfig();
      
      // 尝试执行首次同步，但不要让同步失败影响配置保存
      try {
        await this.sync();
      } catch (syncError) {
        console.warn('首次同步失败，但服务配置已保存:', syncError);
        // 不抛出错误，让配置仍然能够成功保存
      }
      
      if (this.config.autoSync) {
        await this.startAutoSync();
      }
      
      this.emit('syncEnabled');
      console.log('云同步已启用');
    } catch (error) {
      console.error('启用云同步失败:', error);
      this.isEnabled = false;
      throw error;
    }
  }

  /**
   * 禁用云同步
   */
  async disable() {
    this.isEnabled = false;
    this.stopAutoSync();
    await this.saveConfig();
    this.emit('syncDisabled');
    console.log('云同步已禁用');
  }

  /**
   * 执行同步
   */
  async sync() {
    if (!this.isEnabled || this.isSyncing) {
      return { success: false, message: '同步服务未启用或正在同步中' };
    }

    this.isSyncing = true;
    this.emit('syncStart');
    
    try {
      console.log('开始同步...');
      
      // 1. 获取本地数据
      console.log('获取本地数据...');
      const localData = await this.getLocalData();
      console.log('本地数据获取完成:', {
        notes: localData.notes?.length || 0,
        todos: localData.todos?.length || 0,
        settings: localData.settings?.length || 0,
        version: localData.metadata?.version
      });
      
      // 2. 获取远程数据
      console.log('获取远程数据...');
      const remoteData = await this.getRemoteData();
      if (remoteData) {
        console.log('远程数据获取完成:', {
          notes: remoteData.notes?.length || 0,
          todos: remoteData.todos?.length || 0,
          settings: remoteData.settings?.length || 0,
          version: remoteData.metadata?.version
        });
      } else {
        console.log('没有远程数据，可能是首次同步');
      }
      
      // 3. 比较和合并数据
      console.log('开始合并数据...');
      const mergeResult = await this.mergeData(localData, remoteData);
      console.log('数据合并完成:', {
        localChanges: mergeResult.localChanges.length,
        remoteChanges: mergeResult.remoteChanges.length,
        conflicts: mergeResult.conflicts.length
      });
      
      // 4. 上传本地更改
      if (mergeResult.localChanges.length > 0) {
        console.log('上传本地更改...');
        await this.uploadChanges(mergeResult.localChanges);
        console.log('本地更改上传完成');
      }
      
      // 5. 应用远程更改
      if (mergeResult.remoteChanges.length > 0) {
        console.log('应用远程更改...');
        await this.applyRemoteChanges(mergeResult.remoteChanges);
        console.log('远程更改应用完成');
      }
      
      // 6. 处理冲突
      if (mergeResult.conflicts.length > 0) {
        console.log('处理冲突...');
        await this.handleConflicts(mergeResult.conflicts);
        console.log('冲突处理完成');
      }
      
      // 7. 同步图片 (增量同步)
      // 注意: 坚果云图片同步目前可能不稳定，如遇503错误属正常现象
      let imagesSyncResult = null;
      if (this.config.syncImages && this.imageSync && typeof this.imageSync.syncImages === 'function') {
        try {
          console.log('[图片同步] 开始同步图片...');
          console.log('[图片同步] 提示: 坚果云服务器可能繁忙，如遇503错误会自动重试');
          imagesSyncResult = await this.imageSync.syncImages();
          console.log('[图片同步] 图片同步完成:', imagesSyncResult);
        } catch (imageError) {
          console.warn('[图片同步] 图片同步失败，但不影响主同步流程:', imageError.message);
          console.warn('[图片同步] 提示: 如遇503错误，请稍后重试或等待坚果云服务恢复');
          // 图片同步失败不影响主同步流程
        }
      } else if (!this.config.syncImages) {
        console.log('[图片同步] 图片同步已禁用，如需启用请在设置中开启');
      }
      
      this.lastSyncTime = new Date();
      await this.saveConfig();
      
      const result = {
        success: true,
        timestamp: this.lastSyncTime,
        localChanges: mergeResult.localChanges.length,
        remoteChanges: mergeResult.remoteChanges.length,
        conflicts: mergeResult.conflicts.length,
        images: imagesSyncResult || { uploaded: 0, downloaded: 0, total: 0 }
      };
      
      this.emit('syncComplete', result);
      console.log('同步完成:', result);
      
      return result;
    } catch (error) {
      console.error('同步失败:', error);
      this.emit('syncError', error);
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 获取本地数据
   * 注意：必须包含已删除的笔记(is_deleted=1)，否则删除状态无法同步到云端
   */
  async getLocalData() {
    const DatabaseManager = require('../dao/DatabaseManager');
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.db; // 获取真正的数据库实例
    
    return {
      notes: db.prepare('SELECT * FROM notes').all(), // 包含所有笔记，包括已删除的
      todos: db.prepare('SELECT * FROM todos').all(),
      settings: db.prepare('SELECT * FROM settings').all(),
      categories: db.prepare('SELECT * FROM categories').all(),
      tags: db.prepare('SELECT * FROM tags').all(),
      metadata: {
        lastModified: new Date(),
        version: await this.getDataVersion()
      }
    };
  }

  /**
   * 获取远程数据
   */
  async getRemoteData() {
    return await this.provider.download();
  }

  /**
   * 合并本地和远程数据
   */
  async mergeData(localData, remoteData) {
    const localChanges = [];
    const remoteChanges = [];
    const conflicts = [];

    // 如果没有远程数据，上传所有本地数据
    if (!remoteData) {
      console.log('没有远程数据，将上传所有本地数据');
      return {
        localChanges: this.getAllLocalChanges(localData),
        remoteChanges: [],
        conflicts: []
      };
    }

    // 检查数据版本
    const localVersion = localData.metadata?.version;
    const remoteVersion = remoteData.metadata?.version;
    
    console.log('版本比较:', { local: localVersion, remote: remoteVersion });
    
    // 如果版本相同，可能不需要同步
    if (localVersion && remoteVersion && localVersion === remoteVersion) {
      console.log('数据版本相同，跳过同步');
      return { localChanges: [], remoteChanges: [], conflicts: [] };
    }

    // 比较各个数据表
    const tables = ['notes', 'todos', 'settings', 'categories', 'tags'];
    
    for (const table of tables) {
      const tableMerge = await this.mergeTable(
        localData[table] || [],
        remoteData[table] || [],
        table
      );
      
      localChanges.push(...tableMerge.localChanges);
      remoteChanges.push(...tableMerge.remoteChanges);
      conflicts.push(...tableMerge.conflicts);
    }

    return { localChanges, remoteChanges, conflicts };
  }

  /**
   * 合并单个数据表
   * 正确处理软删除(is_deleted)标志的同步
   */
  async mergeTable(localItems, remoteItems, tableName) {
    const localChanges = [];
    const remoteChanges = [];
    const conflicts = [];

    // 创建映射以便快速查找
    const localMap = new Map(localItems.map(item => [item.id, item]));
    const remoteMap = new Map(remoteItems.map(item => [item.id, item]));

    // 检查本地项目
    for (const localItem of localItems) {
      const remoteItem = remoteMap.get(localItem.id);
      
      if (!remoteItem) {
        // 本地新增项目（包括新删除的项目）
        localChanges.push({
          type: 'create',
          table: tableName,
          data: localItem
        });
      } else {
        // 特别处理笔记的删除状态
        if (tableName === 'notes') {
          const localDeleted = localItem.is_deleted || 0;
          const remoteDeleted = remoteItem.is_deleted || 0;
          
          // 删除状态不同，需要同步
          if (localDeleted !== remoteDeleted) {
            // 比较删除时间和更新时间，决定哪个版本更新
            const localTime = new Date(localItem.deleted_at || localItem.updated_at || localItem.created_at);
            const remoteTime = new Date(remoteItem.deleted_at || remoteItem.updated_at || remoteItem.created_at);
            
            if (localTime > remoteTime) {
              // 本地版本更新（可能是删除或恢复操作）
              console.log(`[同步] 笔记 ${localItem.id} 删除状态变化: local.is_deleted=${localDeleted}, remote.is_deleted=${remoteDeleted}, 使用本地版本`);
              localChanges.push({
                type: 'update',
                table: tableName,
                data: localItem
              });
            } else {
              // 远程版本更新
              console.log(`[同步] 笔记 ${remoteItem.id} 删除状态变化: local.is_deleted=${localDeleted}, remote.is_deleted=${remoteDeleted}, 使用远程版本`);
              remoteChanges.push({
                type: 'update',
                table: tableName,
                data: remoteItem
              });
            }
            continue; // 已处理，跳过后续比较
          }
        }
        
        // 比较更新时间（对于笔记，也考虑deleted_at）
        let localTime = new Date(localItem.updated_at || localItem.created_at);
        let remoteTime = new Date(remoteItem.updated_at || remoteItem.created_at);
        
        // 如果是笔记且已删除，使用deleted_at作为时间参考
        if (tableName === 'notes') {
          if (localItem.is_deleted && localItem.deleted_at) {
            const deletedTime = new Date(localItem.deleted_at);
            if (deletedTime > localTime) localTime = deletedTime;
          }
          if (remoteItem.is_deleted && remoteItem.deleted_at) {
            const deletedTime = new Date(remoteItem.deleted_at);
            if (deletedTime > remoteTime) remoteTime = deletedTime;
          }
        }
        
        // 考虑到时间精度问题，允许1秒的误差
        const timeDiff = Math.abs(localTime.getTime() - remoteTime.getTime());
        
        if (timeDiff > 1000) { // 大于1秒的差异才认为有变化
          if (localTime > remoteTime) {
            // 本地更新
            localChanges.push({
              type: 'update',
              table: tableName,
              data: localItem
            });
          } else {
            // 远程更新
            remoteChanges.push({
              type: 'update',
              table: tableName,
              data: remoteItem
            });
          }
        } else if (this.hasContentDifference(localItem, remoteItem)) {
          // 时间相近但内容不同，产生冲突
          conflicts.push({
            type: 'conflict',
            table: tableName,
            local: localItem,
            remote: remoteItem
          });
        }
      }
    }

    // 检查远程新增项目
    for (const remoteItem of remoteItems) {
      if (!localMap.has(remoteItem.id)) {
        remoteChanges.push({
          type: 'create',
          table: tableName,
          data: remoteItem
        });
      }
    }

    return { localChanges, remoteChanges, conflicts };
  }

  /**
   * 检查内容是否有差异
   */
  hasContentDifference(item1, item2) {
    const excludeFields = ['updated_at', 'created_at', 'deleted_at']; // deleted_at也排除，因为已在时间比较中处理
    
    for (const key in item1) {
      if (!excludeFields.includes(key) && item1[key] !== item2[key]) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 上传本地更改
   */
  async uploadChanges(changes) {
    if (changes.length === 0) return;
    
    const data = await this.getLocalData();
    await this.provider.upload(data);
    
    this.emit('syncProgress', {
      stage: 'upload',
      completed: changes.length,
      total: changes.length
    });
  }

  /**
   * 应用远程更改
   */
  async applyRemoteChanges(changes) {
    const DatabaseManager = require('../dao/DatabaseManager');
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.db; // 获取真正的数据库实例

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          await this.insertRemoteItem(db, change.table, change.data);
        } else if (change.type === 'update') {
          await this.updateRemoteItem(db, change.table, change.data);
        } else if (change.type === 'delete') {
          await this.deleteRemoteItem(db, change.table, change.data);
        }
      } catch (error) {
        console.error(`应用远程更改失败 (${change.table}):`, error);
      }
    }
  }

  /**
   * 处理冲突
   */
  async handleConflicts(conflicts) {
    for (const conflict of conflicts) {
      this.emit('conflictDetected', conflict);
      
      // 根据配置自动解决冲突
      switch (this.config.conflictResolution) {
        case 'local':
          // 使用本地版本
          await this.resolveConflictWithLocal(conflict);
          break;
        case 'remote':
          // 使用远程版本
          await this.resolveConflictWithRemote(conflict);
          break;
        case 'merge':
          // 尝试智能合并
          await this.resolveConflictWithMerge(conflict);
          break;
      }
    }
  }

  /**
   * 启动自动同步
   */
  async startAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
    }
    
    this.autoSyncTimer = setInterval(async () => {
      try {
        await this.sync();
      } catch (error) {
        console.error('自动同步失败:', error);
      }
    }, this.syncInterval);
    
    console.log(`自动同步已启动，间隔: ${this.syncInterval / 1000}秒`);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  /**
   * 获取数据版本
   * 注意：必须包含已删除的笔记，否则删除操作不会更新版本号
   */
  async getDataVersion() {
    const DatabaseManager = require('../dao/DatabaseManager');
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.db; // 获取真正的数据库实例
    
    const result = db.prepare(`
      SELECT MAX(updated_at) as last_update FROM (
        SELECT updated_at FROM notes
        UNION ALL
        SELECT updated_at FROM todos
        UNION ALL
        SELECT updated_at FROM settings
        UNION ALL
        SELECT updated_at FROM categories
        UNION ALL
        SELECT updated_at FROM tags
      )
    `).get();
    
    return result.last_update || new Date().toISOString();
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    const configPath = path.join(app.getPath('userData'), 'sync-config.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      this.isEnabled = config.isEnabled || false;
      this.config = { ...this.config, ...config.config };
      this.lastSyncTime = config.lastSyncTime ? new Date(config.lastSyncTime) : null;
    }
  }

  /**
   * 保存配置
   */
  async saveConfig() {
    const configPath = path.join(app.getPath('userData'), 'sync-config.json');
    const config = {
      isEnabled: this.isEnabled,
      config: this.config,
      lastSyncTime: this.lastSyncTime
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * 事件监听
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  // 以下方法需要在子类中实现
  getAllLocalChanges(localData) {
    throw new Error('getAllLocalChanges method must be implemented');
  }

  insertRemoteItem(db, table, data) {
    throw new Error('insertRemoteItem method must be implemented');
  }

  updateRemoteItem(db, table, data) {
    throw new Error('updateRemoteItem method must be implemented');
  }

  deleteRemoteItem(db, table, data) {
    throw new Error('deleteRemoteItem method must be implemented');
  }

  resolveConflictWithLocal(conflict) {
    throw new Error('resolveConflictWithLocal method must be implemented');
  }

  resolveConflictWithRemote(conflict) {
    throw new Error('resolveConflictWithRemote method must be implemented');
  }

  resolveConflictWithMerge(conflict) {
    throw new Error('resolveConflictWithMerge method must be implemented');
  }
}

module.exports = CloudSyncService;