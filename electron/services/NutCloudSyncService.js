const CloudSyncService = require('./CloudSyncService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { EventEmitter } = require('events');
const NutCloudImageSync = require('./NutCloudImageSync');
const IncrementalSyncService = require('./IncrementalSyncService');
const ConflictResolver = require('../utils/ConflictResolver');
const RetryHelper = require('../utils/RetryHelper');
const { getInstance: getDeviceIdManager } = require('../utils/DeviceIdManager');

// ========== 同步日志工具 ==========
// 将日志写入文件，方便打包后调试
const syncLogFile = path.join(app.getPath('userData'), 'sync-debug.log');
function syncLog(...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : a).join(' ')}\n`;
  console.log(...args);
  try {
    fs.appendFileSync(syncLogFile, message);
  } catch (e) { /* ignore */ }
}
// 启动时清空日志文件
try { fs.writeFileSync(syncLogFile, `=== FlashNote 同步日志 ===\n启动时间: ${new Date().toISOString()}\n日志路径: ${syncLogFile}\n\n`); } catch (e) { /* ignore */ }

/**
 * 坚果云同步服务提供商
 * 基于WebDAV协议实现
 */
class NutCloudProvider extends EventEmitter {
  constructor() {
    super();
    this.baseUrl = 'https://dav.jianguoyun.com/dav';
    this.username = null;
    this.password = null; // 应用密码
    this.appFolder = '/FlashNote'; // 应用专用文件夹
    this.dataFile = '/FlashNote/flashnote-data.json';
    this.versionsFolder = '/FlashNote/versions'; // 版本文件夹
    this.maxVersions = 20; // 最大版本数
    this.isAuthenticated = false;
  }

  /**
   * 初始化提供商 - 加载保存的凭据
   */
  async initialize() {
    const loaded = await this.loadCredentials();
    if (loaded) {
      // 如果有保存的凭据，尝试验证连接
      try {
        await this.authenticate();
      } catch (error) {
        console.warn('保存的坚果云凭据验证失败:', error);
        this.isAuthenticated = false;
      }
    }
  }

  /**
   * 设置认证信息
   */
  setCredentials(username, password) {
    this.username = username;
    this.password = password;
  }

  /**
   * 保存认证信息到本地
   */
  async saveCredentials() {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    
    const credentialsPath = path.join(app.getPath('userData'), 'nutcloud-credentials.json');
    const credentials = {
      username: this.username,
      password: this.password // 注意：实际生产环境中应该加密存储
    };
    
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
  }

  /**
   * 从本地加载认证信息
   */
  async loadCredentials() {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    
    const credentialsPath = path.join(app.getPath('userData'), 'nutcloud-credentials.json');
    
    if (fs.existsSync(credentialsPath)) {
      try {
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        this.username = credentials.username;
        this.password = credentials.password;
        return true;
      } catch (error) {
        console.error('加载坚果云凭据失败:', error);
        return false;
      }
    }
    
    return false;
  }

  /**
   * 清除保存的认证信息
   */
  async clearCredentials() {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    
    const credentialsPath = path.join(app.getPath('userData'), 'nutcloud-credentials.json');
    
    if (fs.existsSync(credentialsPath)) {
      fs.unlinkSync(credentialsPath);
    }
    
    this.username = null;
    this.password = null;
    this.isAuthenticated = false;
  }

  /**
   * 验证连接
   */
  async authenticate() {
    if (!this.username || !this.password) {
      throw new Error('请先设置坚果云用户名和应用密码');
    }

    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // 测试连接
        const response = await axios({
          method: 'PROPFIND',
          url: this.baseUrl,
          auth: {
            username: this.username,
            password: this.password
          },
          headers: {
            'Depth': '1',
            'Content-Type': 'application/xml'
          },
          timeout: 10000
        });

        if (response.status === 207) {
          this.isAuthenticated = true;
          
          // 确保应用文件夹存在
          await this.ensureAppFolder();
          
          console.log('坚果云认证成功');
          return true;
        }
      } catch (error) {
        this.isAuthenticated = false;
        
        // 503错误且还有重试次数，则重试
        if (error.response?.status === 503 && retries < maxRetries - 1) {
          retries++;
          const waitTime = retries * 2000; // 2s, 4s, 6s
          console.warn(`[坚果云] 服务器繁忙(503)，${waitTime}ms后重试 (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // 其他错误直接抛出
        if (error.response?.status === 401) {
          throw new Error('坚果云用户名或应用密码错误');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
          throw new Error('网络连接失败，请检查网络设置');
        } else if (error.response?.status === 503) {
          throw new Error('坚果云服务器繁忙，请稍后再试');
        } else {
          throw new Error(`坚果云连接失败: ${error.message}`);
        }
      }
    }
  }

  /**
   * 确保应用文件夹存在
   */
  async ensureAppFolder() {
    try {
      await axios({
        method: 'MKCOL',
        url: this.baseUrl + this.appFolder,
        auth: {
          username: this.username,
          password: this.password
        },
        timeout: 10000
      });
      console.log('[坚果云Provider] 应用文件夹创建成功');
    } catch (error) {
      // 405或409表示文件夹已存在，这是正常的
      if (error.response?.status === 405 || error.response?.status === 409) {
        console.log('[坚果云Provider] 应用文件夹已存在');
        return;
      }
      
      // 其他错误需要抛出，不能吞掉
      console.error('[坚果云Provider] 创建应用文件夹失败:', error);
      
      let errorMessage = error.message;
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        errorMessage = '网络连接失败，无法访问坚果云服务器';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '连接超时';
      }
      
      throw new Error(`创建应用文件夹失败: ${errorMessage}`);
    }
  }

  /**
   * 上传数据
   */
  async upload(data) {
    if (!this.isAuthenticated) {
      // 如果没有凭据，先尝试加载保存的凭据
      if (!this.username || !this.password) {
        await this.loadCredentials();
      }
      await this.authenticate();
    }

    try {
      // 检查是否需要创建版本备份
      const versionCheck = await this.shouldCreateVersion(data);
      console.log('版本检查结果:', versionCheck);
      
      if (versionCheck.should) {
        const versionResult = await this.createVersion(data, versionCheck.reason);
        
        if (!versionResult.success) {
          console.warn('创建版本备份失败，但继续上传数据:', versionResult);
          
          // 发送事件通知用户版本创建失败
          this.emit('versionCreationFailed', {
            reason: versionCheck.reason,
            error: versionResult.error || versionResult.message,
            skipped: versionResult.skipped || false
          });
        } else {
          console.log(`✅ 版本创建成功: v${versionResult.version}`);
        }
      }

      // 获取数据版本用于包装
      const dataVersion = await this.getDataVersion();
      
      const jsonData = JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
        version: dataVersion // 使用实际的数据版本
      }, null, 2);

      const response = await axios({
        method: 'PUT',
        url: this.baseUrl + this.dataFile,
        auth: {
          username: this.username,
          password: this.password
        },
        data: jsonData,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 201 || response.status === 204) {
        console.log('数据上传到坚果云成功');
        return true;
      }
    } catch (error) {
      console.error('上传到坚果云失败:', error);
      throw new Error(`上传失败: ${error.response?.data || error.message}`);
    }
  }

  /**
   * 下载数据
   */
  async download() {
    console.log('[坚果云Provider] 开始下载数据...');
    
    if (!this.isAuthenticated) {
      console.log('[坚果云Provider] 未认证，尝试加载凭据...');
      // 如果没有凭据，先尝试加载保存的凭据
      if (!this.username || !this.password) {
        console.log('[坚果云Provider] 加载保存的凭据...');
        const loaded = await this.loadCredentials();
        if (!loaded || !this.username || !this.password) {
          console.error('[坚果云Provider] 未找到保存的凭据或凭据不完整');
          throw new Error('请先在设置中配置坚果云账户信息（用户名和应用密码）');
        }
        console.log('[坚果云Provider] 凭据加载成功');
      }
      
      console.log('[坚果云Provider] 开始认证...');
      try {
        await this.authenticate();
        console.log('[坚果云Provider] 认证成功');
      } catch (authError) {
        console.error('[坚果云Provider] 认证失败:', authError);
        throw authError; // 直接抛出认证错误，它已经包含了友好的错误信息
      }
    }

    try {
      console.log('[坚果云Provider] 发起下载请求...');
      const response = await axios({
        method: 'GET',
        url: this.baseUrl + this.dataFile,
        auth: {
          username: this.username,
          password: this.password
        },
        responseType: 'text' // 明确指定响应类型为文本
      });

      if (response.status === 200) {
        console.log('[坚果云Provider] 下载成功，解析数据...');
        try {
          // 现在response.data应该是字符串，需要解析为JSON
          const result = JSON.parse(response.data);
          console.log('[坚果云Provider] 数据解析成功');
          
          // 确保返回的数据包含metadata
          if (result.data) {
            // 如果有包装的data字段，返回完整结构
            return {
              ...result.data,
              metadata: {
                lastModified: new Date(result.timestamp || new Date()),
                version: result.version
              }
            };
          } else {
            // 如果没有包装，直接返回数据，但添加metadata
            return {
              ...result,
              metadata: {
                lastModified: new Date(),
                version: result.version || new Date().toISOString()
              }
            };
          }
        } catch (parseError) {
          console.error('[坚果云Provider] 解析JSON数据失败:', parseError);
          console.log('[坚果云Provider] 原始响应数据:', response.data);
          throw new Error(`数据格式错误: ${parseError.message}`);
        }
      }
    } catch (error) {
      if (error.response?.status === 404) {
        // 文件不存在，返回null表示首次同步
        console.log('[坚果云Provider] 坚果云上没有找到数据文件，这是首次同步');
        return null;
      }
      console.error('[坚果云Provider] 从坚果云下载失败:', error);
      
      // 改进错误信息处理
      let errorMessage = error.message;
      if (error.response?.status === 401) {
        errorMessage = '坚果云用户名或应用密码错误，请检查设置';
      } else if (error.response?.status === 403) {
        errorMessage = '没有权限访问坚果云，请检查账户权限';
      } else if (error.response?.status === 503) {
        errorMessage = '坚果云服务器繁忙，请稍后重试';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        errorMessage = '网络连接失败，请检查网络设置';
      } else if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (typeof error.response.data === 'object') {
          errorMessage = JSON.stringify(error.response.data);
        }
      }
      
      throw new Error(`下载失败: ${errorMessage}`);
    }
  }

  /**
   * 检查文件是否存在
   */
  async exists() {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await axios({
        method: 'HEAD',
        url: this.baseUrl + this.dataFile,
        auth: {
          username: this.username,
          password: this.password
        },
        timeout: 10000
      });

      return response.status === 200;
    } catch (error) {
      // 404表示文件不存在，这是正常情况
      if (error.response?.status === 404) {
        return false;
      }
      
      // 其他错误（网络错误、认证错误等）应该抛出
      console.error('[坚果云Provider] 检查文件存在性失败:', error);
      
      let errorMessage = error.message;
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        errorMessage = '网络连接失败，无法访问坚果云服务器';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '连接超时，请检查网络';
      } else if (error.response?.status === 401) {
        errorMessage = '坚果云认证失败';
      } else if (error.response?.status === 403) {
        errorMessage = '没有权限访问';
      }
      
      throw new Error(`检查文件失败: ${errorMessage}`);
    }
  }

  /**
   * 获取文件信息
   */
  async getFileInfo() {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await axios({
        method: 'PROPFIND',
        url: this.baseUrl + this.dataFile,
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Depth': '0',
          'Content-Type': 'application/xml'
        }
      });

      if (response.status === 207) {
        // 解析WebDAV响应获取文件信息
        return {
          exists: true,
          lastModified: new Date(), // 这里需要解析XML响应
          size: 0 // 这里需要解析XML响应
        };
      }
    } catch (error) {
      if (error.response?.status === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  /**
   * 获取数据版本
   * 注意：必须包含已删除的笔记，否则删除操作不会更新版本号
   */
  async getDataVersion() {
    const DatabaseManager = require('../dao/DatabaseManager');
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.db;
    
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
   * 创建版本备份
   */
  async createVersion(data, description = '') {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    // 防止并发创建版本
    if (this._creatingVersion) {
      console.warn('正在创建版本中，跳过重复请求');
      return {
        success: false,
        skipped: true,
        reason: 'concurrent_creation',
        message: '正在创建版本中，跳过重复请求'
      };
    }
    
    this._creatingVersion = true;

    try {
      // 确保版本文件夹存在
      await this.ensureVersionsFolder();

      // 生成版本文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const versionNumber = await this.getNextVersionNumber();
      const fileName = `v${versionNumber}_${timestamp}.json`;
      const filePath = `${this.versionsFolder}/${fileName}`;

      // 准备版本数据
      const versionData = {
        version: versionNumber,
        timestamp: new Date().toISOString(),
        description: description || `自动备份 - ${new Date().toLocaleString('zh-CN')}`,
        data: data,
        metadata: {
          notes_count: data.notes?.length || 0,
          todos_count: data.todos?.length || 0,
          settings_count: data.settings?.length || 0
        }
      };

      // 上传版本文件
      const response = await axios({
        method: 'PUT',
        url: this.baseUrl + filePath,
        auth: {
          username: this.username,
          password: this.password
        },
        data: JSON.stringify(versionData, null, 2),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 201 || response.status === 204) {
        console.log(`版本创建成功: ${fileName}`);
        
        // 检查并清理旧版本
        await this.cleanupOldVersions();
        
        return {
          success: true,
          version: versionNumber,
          fileName: fileName,
          timestamp: versionData.timestamp,
          description: versionData.description
        };
      }
    } catch (error) {
      console.error('创建版本失败:', error);
      return {
        success: false,
        error: error.message,
        reason: 'creation_failed'
      };
    } finally {
      this._creatingVersion = false;
    }
  }

  /**
   * 获取版本列表
   */
  async getVersions() {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await axios({
        method: 'PROPFIND',
        url: this.baseUrl + this.versionsFolder,
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      });

      if (response.status === 207) {
        // 解析WebDAV响应，提取版本文件信息
        const versions = [];
        const data = response.data;
        
        // 简单的正则匹配来提取文件名，使用Set去重
        const fileMatches = [...new Set(data.match(/v\d+_[\d-T]+\.json/g) || [])];
        
        for (const fileName of fileMatches) {
          try {
            const versionData = await this.getVersionData(fileName);
            
            // 检查是否已有相同版本号的数据，避免重复
            const existingIndex = versions.findIndex(v => v.version === versionData.version);
            if (existingIndex === -1) {
              versions.push({
                fileName: fileName,
                version: versionData.version,
                timestamp: versionData.timestamp,
                description: versionData.description,
                metadata: versionData.metadata
              });
            } else {
              console.warn(`发现重复版本号: ${versionData.version}, 文件: ${fileName}`);
            }
          } catch (error) {
            console.warn(`读取版本文件失败: ${fileName}`, error);
          }
        }

        // 按版本号降序排列
        versions.sort((a, b) => b.version - a.version);
        return versions;
      }
      
      return [];
    } catch (error) {
      if (error.response?.status === 404) {
        // 版本文件夹不存在
        return [];
      }
      console.error('获取版本列表失败:', error);
      throw new Error(`获取版本列表失败: ${error.message}`);
    }
  }

  /**
   * 获取特定版本的数据
   */
  async getVersionData(fileName) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await axios({
        method: 'GET',
        url: this.baseUrl + `${this.versionsFolder}/${fileName}`,
        auth: {
          username: this.username,
          password: this.password
        },
        responseType: 'text'
      });

      if (response.status === 200) {
        return JSON.parse(response.data);
      }
    } catch (error) {
      console.error(`获取版本数据失败 (${fileName}):`, error);
      throw new Error(`获取版本数据失败: ${error.message}`);
    }
  }

  /**
   * 恢复到指定版本
   */
  async restoreVersion(fileName) {
    try {
      const versionData = await this.getVersionData(fileName);
      
      // 恢复数据就是将版本数据作为当前数据上传
      await this.upload(versionData.data);
      
      console.log(`版本恢复成功: ${fileName}`);
      return versionData.data;
    } catch (error) {
      console.error(`版本恢复失败 (${fileName}):`, error);
      throw new Error(`版本恢复失败: ${error.message}`);
    }
  }

  /**
   * 删除指定版本
   */
  async deleteVersion(fileName) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await axios({
        method: 'DELETE',
        url: this.baseUrl + `${this.versionsFolder}/${fileName}`,
        auth: {
          username: this.username,
          password: this.password
        }
      });

      if (response.status === 204) {
        console.log(`版本删除成功: ${fileName}`);
        return true;
      }
    } catch (error) {
      console.error(`删除版本失败 (${fileName}):`, error);
      throw new Error(`删除版本失败: ${error.message}`);
    }
  }

  /**
   * 确保版本文件夹存在
   */
  async ensureVersionsFolder() {
    try {
      // 尝试创建版本文件夹（WebDAV的MKCOL方法）
      await axios({
        method: 'MKCOL',
        url: this.baseUrl + this.versionsFolder,
        auth: {
          username: this.username,
          password: this.password
        }
      });
    } catch (error) {
      if (error.response?.status !== 405 && error.response?.status !== 409) {
        // 405: 方法不允许（文件夹已存在）
        // 409: 冲突（文件夹已存在）
        console.warn('创建版本文件夹失败:', error.message);
      }
    }
  }

  /**
   * 获取下一个版本号
   */
  async getNextVersionNumber() {
    try {
      const versions = await this.getVersions();
      if (versions.length === 0) {
        return 1;
      }
      return Math.max(...versions.map(v => v.version)) + 1;
    } catch (error) {
      return 1;
    }
  }

  /**
   * 清理旧版本（保持最新的20个版本）
   */
  async cleanupOldVersions() {
    try {
      const versions = await this.getVersions();
      
      if (versions.length > this.maxVersions) {
        // 删除超出数量的旧版本
        const versionsToDelete = versions.slice(this.maxVersions);
        
        for (const version of versionsToDelete) {
          try {
            await this.deleteVersion(version.fileName);
            console.log(`清理旧版本: ${version.fileName}`);
          } catch (error) {
            console.warn(`清理版本失败: ${version.fileName}`, error);
          }
        }
      }
    } catch (error) {
      console.warn('清理旧版本失败:', error);
    }
  }

  /**
   * 检查是否需要创建新版本
   */
  async shouldCreateVersion(newData) {
    try {
      const versions = await this.getVersions();
      
      // 如果没有版本，创建第一个版本
      if (versions.length === 0) {
        return { should: true, reason: '首次创建版本' };
      }

      const lastVersion = versions[0];
      const lastVersionTime = new Date(lastVersion.timestamp);
      const now = new Date();
      
      // 时间检查：超过1小时自动创建版本
      const hoursDiff = (now - lastVersionTime) / (1000 * 60 * 60);
      if (hoursDiff >= 1) {
        return { should: true, reason: '距离上次版本超过1小时' };
      }

      // 数据变化检查：比较数据量变化
      const lastVersionData = await this.getVersionData(lastVersion.fileName);
      const lastData = lastVersionData.data;
      
      const changePercentage = this.calculateDataChangePercentage(lastData, newData);
      if (changePercentage >= 10) {
        return { should: true, reason: `数据变化超过${changePercentage}%` };
      }

      return { should: false, reason: '无需创建新版本' };
    } catch (error) {
      console.warn('检查版本创建条件失败:', error);
      return { should: false, reason: '检查失败' };
    }
  }

  /**
   * 计算数据变化百分比
   * 改进：同时检测数量变化和内容变化（基于 updated_at）
   */
  calculateDataChangePercentage(oldData, newData) {
    const tables = ['notes', 'todos', 'settings', 'categories', 'tags'];
    let totalChanges = 0;
    let totalItems = 0;

    for (const table of tables) {
      const oldItems = oldData[table] || [];
      const newItems = newData[table] || [];
      
      // 统计总项目数（取较大值）
      totalItems += Math.max(oldItems.length, newItems.length);
      
      // 1. 检查数量变化
      const quantityChange = Math.abs(oldItems.length - newItems.length);
      totalChanges += quantityChange;
      
      // 2. 检查内容变化（基于 updated_at 或 deleted_at）
      if (oldItems.length > 0 && newItems.length > 0) {
        // 构建旧数据的时间戳映射（使用 sync_id 或 id）
        const oldMap = new Map();
        for (const item of oldItems) {
          const key = item.sync_id || item.id;
          const timestamp = item.deleted_at || item.updated_at || item.created_at;
          oldMap.set(key, timestamp);
        }
        
        // 检查每个新项目是否有变化
        for (const newItem of newItems) {
          const key = newItem.sync_id || newItem.id;
          const newTimestamp = newItem.deleted_at || newItem.updated_at || newItem.created_at;
          const oldTimestamp = oldMap.get(key);
          
          if (!oldTimestamp || oldTimestamp !== newTimestamp) {
            // 内容发生变化，权重为 0.5（比新增/删除影响小）
            totalChanges += 0.5;
          }
        }
      }
    }

    if (totalItems === 0) return 100;
    const percentage = (totalChanges / totalItems) * 100;
    
    // 输出详细日志便于调试
    console.log(`[版本检查] 数据变化: ${totalChanges.toFixed(1)} / ${totalItems} = ${percentage.toFixed(1)}%`);
    
    return percentage;
  }

  /**
   * ==================== 增量同步支持方法 ====================
   */

  /**
   * 上传变更包到云端
   */
  async uploadChanges(filepath, changePackage) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      // 确保增量文件夹存在
      const incrementalFolder = '/FlashNote/incremental';
      await this.ensureFolder(incrementalFolder);

      const response = await axios({
        method: 'PUT',
        url: this.baseUrl + filepath,
        auth: {
          username: this.username,
          password: this.password
        },
        data: JSON.stringify(changePackage, null, 2),
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30秒超时
      });

      if (response.status === 201 || response.status === 204) {
        console.log(`上传变更包成功: ${filepath}`);
        return true;
      }
      
      throw new Error(`上传失败，服务器返回状态码: ${response.status}`);
    } catch (error) {
      console.error(`上传变更包失败: ${filepath}`, error);
      
      // 改进错误信息
      let errorMessage = error.message;
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        errorMessage = '网络连接失败，无法访问坚果云服务器';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '上传超时，请检查网络连接';
      } else if (error.response?.status === 401) {
        errorMessage = '坚果云认证失败，请检查用户名和应用密码';
      } else if (error.response?.status === 403) {
        errorMessage = '没有权限访问坚果云，请检查账户权限';
      } else if (error.response?.status === 507) {
        errorMessage = '坚果云存储空间不足';
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * 从云端下载变更列表
   */
  async downloadChanges(since) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const incrementalFolder = '/FlashNote/incremental';
      
      // 列出增量文件夹中的所有变更文件
      const response = await axios({
        method: 'PROPFIND',
        url: this.baseUrl + incrementalFolder,
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      });

      if (response.status !== 207) {
        return [];
      }

      // 解析WebDAV响应，获取文件列表
      const files = this._parseWebDAVResponse(response.data);
      
      // 获取本设备 ID，用于过滤
      const deviceIdManager = getDeviceIdManager();
      const ownDeviceId = deviceIdManager.getShortDeviceId();
      
      // 过滤出在指定时间之后的变更文件，并排除本设备生成的文件
      const sinceTime = new Date(since).getTime();
      const recentFiles = files.filter(file => {
        const fileTime = new Date(file.lastModified).getTime();
        if (fileTime <= sinceTime) {
          return false;
        }
        
        // 排除本设备生成的变更文件，避免重复应用自己的变更
        const filename = file.path.split('/').pop() || file.path;
        if (filename.includes(`-${ownDeviceId}-`)) {
          console.log(`[增量同步] 跳过本设备(${ownDeviceId})的变更文件: ${filename}`);
          return false;
        }
        
        return true;
      });

      // 下载并合并所有变更
      const allChanges = [];
      for (const file of recentFiles) {
        try {
          const changePackage = await this._downloadChangeFile(file.path);
          if (changePackage && changePackage.changes) {
            allChanges.push(...changePackage.changes);
          }
        } catch (error) {
          // 404 或 409 错误：文件不存在或冲突，跳过
          if (error.response?.status === 404 || error.response?.status === 409) {
            console.warn(`[增量同步] 跳过无法访问的变更文件: ${file.path}`);
            continue;
          }
          console.warn(`[增量同步] 下载变更文件失败，跳过: ${file.path}`, error.message);
        }
      }

      return allChanges;
    } catch (error) {
      if (error.response?.status === 404) {
        // 增量文件夹不存在，返回空列表（这是正常情况，不是错误）
        console.log('[增量同步] 增量文件夹不存在，可能是首次同步');
        return [];
      }
      
      // 其他错误都应该抛出，不能吞掉
      console.error('[增量同步] 下载远程变更失败:', error);
      
      // 改进错误信息
      let errorMessage = error.message;
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        errorMessage = '网络连接失败，无法访问坚果云服务器';
      } else if (error.response?.status === 401) {
        errorMessage = '坚果云认证失败，请检查用户名和应用密码';
      } else if (error.response?.status === 403) {
        errorMessage = '没有权限访问坚果云，请检查账户权限';
      } else if (error.response?.status === 503) {
        errorMessage = '坚果云服务器繁忙，请稍后重试';
      }
      
      throw new Error(`下载远程变更失败: ${errorMessage}`);
    }
  }

  /**
   * 获取实体的版本历史
   */
  async getVersionHistory(entityType, entityId) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      // 获取所有版本
      const versions = await this.getVersions();
      
      // 提取包含该实体的版本
      const entityVersions = [];
      
      for (const version of versions) {
        try {
          // 下载版本文件
          const versionData = await this.downloadVersion(version.fileName);
          
          // 检查是否包含该实体
          let entityData = null;
          if (entityType === 'note' && versionData.data?.notes) {
            entityData = versionData.data.notes.find(n => n.id === entityId);
          } else if (entityType === 'todo' && versionData.data?.todos) {
            entityData = versionData.data.todos.find(t => t.id === entityId);
          }
          
          if (entityData) {
            entityVersions.push({
              timestamp: version.timestamp,
              version: version.version,
              data: entityData
            });
          }
        } catch (error) {
          console.warn(`读取版本失败: ${version.fileName}`, error);
        }
      }
      
      // 按时间降序排序（最新的在前面）
      entityVersions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return entityVersions;
    } catch (error) {
      console.error(`获取版本历史失败 (${entityType}:${entityId})`, error);
      return [];
    }
  }

  /**
   * 确保文件夹存在
   */
  async ensureFolder(folderPath) {
    try {
      await axios({
        method: 'MKCOL',
        url: this.baseUrl + folderPath,
        auth: {
          username: this.username,
          password: this.password
        },
        timeout: 10000
      });
      console.log(`[坚果云Provider] 创建文件夹成功: ${folderPath}`);
    } catch (error) {
      // 405或409表示文件夹已存在，这是正常的
      if (error.response?.status === 405 || error.response?.status === 409) {
        console.log(`[坚果云Provider] 文件夹已存在: ${folderPath}`);
        return;
      }
      
      // 其他错误需要抛出
      console.error(`[坚果云Provider] 创建文件夹失败: ${folderPath}`, error);
      
      let errorMessage = error.message;
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        errorMessage = '网络连接失败，无法访问坚果云服务器';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '连接超时';
      } else if (error.response?.status === 401) {
        errorMessage = '认证失败';
      } else if (error.response?.status === 403) {
        errorMessage = '没有权限';
      }
      
      throw new Error(`创建文件夹失败: ${errorMessage}`);
    }
  }

  /**
   * 下载变更文件
   */
  async _downloadChangeFile(filepath) {
    try {
      const response = await axios({
        method: 'GET',
        url: this.baseUrl + filepath,
        auth: {
          username: this.username,
          password: this.password
        },
        timeout: 10000
      });

      if (response.status === 200) {
        return typeof response.data === 'string' 
          ? JSON.parse(response.data) 
          : response.data;
      }
      return null;
    } catch (error) {
      // 让上层决定如何处理错误
      throw error;
    }
  }

  /**
   * 解析WebDAV响应
   */
  _parseWebDAVResponse(xmlData) {
    // 简单的XML解析，提取文件信息
    const files = [];
    const hrefRegex = /<d:href>([^<]+)<\/d:href>/g;
    const modifiedRegex = /<d:getlastmodified>([^<]+)<\/d:getlastmodified>/g;
    
    let match;
    const hrefs = [];
    while ((match = hrefRegex.exec(xmlData)) !== null) {
      hrefs.push(match[1]);
    }
    
    const modifiedDates = [];
    while ((match = modifiedRegex.exec(xmlData)) !== null) {
      modifiedDates.push(match[1]);
    }
    
    for (let i = 0; i < hrefs.length; i++) {
      const href = hrefs[i];
      // 跳过文件夹本身
      if (href.endsWith('.json')) {
        // 提取相对路径，移除 /dav/ 前缀（如果有）
        let relativePath = decodeURIComponent(href);
        if (relativePath.startsWith('/dav/')) {
          relativePath = relativePath.substring(4); // 移除 '/dav'
        }
        
        files.push({
          path: relativePath,
          lastModified: modifiedDates[i] || new Date().toISOString()
        });
      }
    }
    
    return files;
  }
}

/**
 * 坚果云同步服务
 */
class NutCloudSyncService extends CloudSyncService {
  constructor() {
    const provider = new NutCloudProvider();
    super(provider);
    this.serviceName = 'NutCloud';
    
    // 初始化图片同步服务
    this.imageSync = new NutCloudImageSync(provider);
    
    // 初始化增量同步服务
    this.incrementalSync = new IncrementalSyncService(provider);
    
    // 创建断路器
    this.circuitBreaker = RetryHelper.createCircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenRequests: 3
    });
    
    // 异步初始化provider
    this.initializeProvider();
  }

  /**
   * 初始化provider - 加载保存的凭据
   */
  async initializeProvider() {
    await this.provider.initialize();
    
    // 初始化图片同步服务
    const imagesDir = path.join(app.getPath('userData'), 'images');
    const whiteboardDir = path.join(imagesDir, 'whiteboard');
    await this.imageSync.initialize(imagesDir, whiteboardDir);
  }

  /**
   * 配置坚果云连接
   */
  async configure(username, password) {
    this.provider.setCredentials(username, password);
    try {
      await this.provider.authenticate();
      // 保存凭据到本地
      await this.provider.saveCredentials();
      return { success: true, message: '坚果云配置成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * 获取所有本地更改
   */
  getAllLocalChanges(localData) {
    const changes = [];
    
    // 添加所有表的数据作为初始上传
    const tables = ['notes', 'todos', 'settings', 'categories', 'tags'];
    
    for (const table of tables) {
      if (localData[table]) {
        for (const item of localData[table]) {
          changes.push({
            type: 'create',
            table: table,
            data: item
          });
        }
      }
    }
    
    return changes;
  }

  /**
   * 插入远程项目
   */
  async insertRemoteItem(dbParam, table, data) {
    syncLog(`[insertRemoteItem] 开始插入 ${table}`, { id: data?.id, sync_id: data?.sync_id, title: data?.title?.substring(0, 30) });
    
    // 获取数据库实例，优先使用传入的参数，否则自己获取
    let db = dbParam;
    if (!db || typeof db.prepare !== 'function') {
      syncLog(`[insertRemoteItem] 传入的db无效，重新获取数据库实例`);
      const DatabaseManager = require('../dao/DatabaseManager');
      const dbManager = DatabaseManager.getInstance();
      db = dbManager.db;
    }
    
    if (table === 'notes') {
      // 如果远程数据没有 sync_id，生成一个新的
      const syncId = data.sync_id || require('crypto').randomUUID();
      syncLog(`[insertRemoteItem] notes - syncId: ${syncId}`);
      
      // 检查本地是否已存在此 sync_id
      const existingNote = db.prepare('SELECT id FROM notes WHERE sync_id = ?').get(syncId);
      syncLog(`[insertRemoteItem] notes - 本地存在: ${!!existingNote}`);
      
      if (existingNote) {
        // 已存在，使用本地的 id 进行更新
        const stmt = db.prepare('UPDATE notes SET title = ?, content = ?, tags = ?, category = ?, is_pinned = ?, is_deleted = ?, created_at = ?, updated_at = ?, deleted_at = ?, note_type = ? WHERE sync_id = ?');
        const result = stmt.run(data.title, data.content, data.tags, data.category, data.is_pinned, data.is_deleted, data.created_at, data.updated_at, data.deleted_at, data.note_type || 'markdown', syncId);
        syncLog(`[insertRemoteItem] notes - UPDATE 完成: changes=${result.changes}`);
      } else {
        // 不存在，插入新记录（让 SQLite 自动生成新的本地 id）
        const stmt = db.prepare('INSERT INTO notes (sync_id, title, content, tags, category, is_pinned, is_deleted, created_at, updated_at, deleted_at, note_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const result = stmt.run(syncId, data.title, data.content, data.tags, data.category, data.is_pinned, data.is_deleted, data.created_at, data.updated_at, data.deleted_at, data.note_type || 'markdown');
        syncLog(`[insertRemoteItem] notes - INSERT 完成: id=${result.lastInsertRowid}`);
      }
    } else if (table === 'todos') {
      // 如果远程数据没有 sync_id，生成一个新的
      const syncId = data.sync_id || require('crypto').randomUUID();
      
      // 检查本地是否已存在此 sync_id
      const existingTodo = db.prepare('SELECT id FROM todos WHERE sync_id = ?').get(syncId);
      
      if (existingTodo) {
        // 已存在，使用本地的 id 进行更新
        const stmt = db.prepare(`UPDATE todos SET 
          content = ?, description = ?, tags = ?, 
          is_completed = ?, is_important = ?, is_urgent = ?, 
          due_date = ?, end_date = ?, item_type = ?, has_time = ?, 
          focus_time_seconds = ?, repeat_type = ?, repeat_days = ?, 
          repeat_interval = ?, next_due_date = ?, is_recurring = ?, 
          parent_todo_id = ?, is_deleted = ?, deleted_at = ?, 
          created_at = ?, updated_at = ?, completed_at = ?
          WHERE sync_id = ?`);
        stmt.run(
          data.content, data.description || '', data.tags, 
          data.is_completed, data.is_important, data.is_urgent, 
          data.due_date, data.end_date, data.item_type || 'todo', data.has_time || 0, 
          data.focus_time_seconds || 0, data.repeat_type || 'none', data.repeat_days || '', 
          data.repeat_interval || 1, data.next_due_date, data.is_recurring || 0, 
          data.parent_todo_id, data.is_deleted || 0, data.deleted_at, 
          data.created_at, data.updated_at, data.completed_at, syncId
        );
      } else {
        // 不存在，插入新记录（让 SQLite 自动生成新的本地 id）
        const stmt = db.prepare('INSERT INTO todos (sync_id, content, description, tags, is_completed, is_important, is_urgent, due_date, end_date, item_type, has_time, focus_time_seconds, repeat_type, repeat_days, repeat_interval, next_due_date, is_recurring, parent_todo_id, is_deleted, deleted_at, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        stmt.run(
          syncId, data.content, data.description || '', data.tags, 
          data.is_completed, data.is_important, data.is_urgent, data.due_date, data.end_date,
          data.item_type || 'todo', data.has_time || 0, data.focus_time_seconds || 0,
          data.repeat_type || 'none', data.repeat_days || '', data.repeat_interval || 1,
          data.next_due_date, data.is_recurring || 0, data.parent_todo_id,
          data.is_deleted || 0, data.deleted_at,
          data.created_at, data.updated_at, data.completed_at
        );
      }
    } else if (table === 'settings') {
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, type, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
      stmt.run(data.key, data.value, data.type, data.description, data.created_at, data.updated_at);
    } else if (table === 'categories') {
      const stmt = db.prepare('INSERT OR REPLACE INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      stmt.run(data.id, data.name, data.color, data.icon, data.sort_order, data.created_at, data.updated_at);
    } else if (table === 'tags') {
      const stmt = db.prepare('INSERT OR REPLACE INTO tags (id, name, color, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
      stmt.run(data.id, data.name, data.color, data.usage_count, data.created_at, data.updated_at);
    }
  }

  /**
   * 更新远程项目
   */
  async updateRemoteItem(dbParam, table, data) {
    // 对于这个实现，更新和插入使用相同的逻辑（INSERT OR REPLACE）
    await this.insertRemoteItem(dbParam, table, data);
  }

  /**
   * 删除远程项目
   */
  async deleteRemoteItem(dbParam, table, data) {
    // 获取数据库实例，优先使用传入的参数，否则自己获取
    let db = dbParam;
    if (!db || typeof db.prepare !== 'function') {
      const DatabaseManager = require('../dao/DatabaseManager');
      const dbManager = DatabaseManager.getInstance();
      db = dbManager.db;
    }

    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    stmt.run(data.id);
  }

  /**
   * 执行增量同步（覆盖父类的sync方法）
   */
  async sync() {
    syncLog('[NutCloudSync] ======== 同步开始 ========');
    syncLog('[NutCloudSync] isEnabled:', this.isEnabled, 'isSyncing:', this.isSyncing);
    
    if (!this.isEnabled || this.isSyncing) {
      syncLog('[NutCloudSync] 同步跳过: isEnabled=', this.isEnabled, 'isSyncing=', this.isSyncing);
      return { success: false, message: '同步服务未启用或正在同步中' };
    }

    // 重置停止标志
    this.isStopping = false;
    if (this.incrementalSync) {
      this.incrementalSync.resetStopFlag();
    }

    this.isSyncing = true;
    this.emit('syncStart');
    
    try {
      syncLog('[NutCloudSync] 尝试增量同步...');
      
      // 使用增量同步服务
      const result = await this.incrementalSync.performIncrementalSync();
      syncLog('[NutCloudSync] 增量同步结果:', result);
      
      // 如果增量同步失败或需要全量同步，回退到全量同步
      if (!result.success || result.needsFullSync) {
        syncLog('[NutCloudSync] ★★★ 需要回退到全量同步 ★★★');
        syncLog('[NutCloudSync] 原因:', result.reason || result.message || '未知原因');
        const fullSyncResult = await super.sync(); // 调用父类的全量同步
        syncLog('[NutCloudSync] 全量同步结果:', fullSyncResult);
        
        // 全量同步成功后，创建同步初始化标记
        if (fullSyncResult.success) {
          await this._markSyncInitialized();
          syncLog('[NutCloudSync] 已创建同步初始化标记');
        }
        
        return fullSyncResult;
      }
      
      // 同步图片（如果启用）
      let imagesSyncResult = null;
      if (this.config.syncImages && this.imageSync) {
        try {
          console.log('[图片同步] 开始同步图片...');
          imagesSyncResult = await this.imageSync.syncImages();
          console.log('[图片同步] 完成:', imagesSyncResult);
        } catch (imageError) {
          console.warn('[图片同步] 失败（不影响主同步）:', imageError.message);
        }
      }
      
      // 清理云端旧的变更文件（滚动窗口策略）
      // 减少保留数量，避免文件堆积
      try {
        await this.cleanupOldChangeFiles(20); // 保留最近20个变更文件，减少存储压力
      } catch (cleanupError) {
        console.warn('[同步] 清理变更文件失败（不影响主流程）:', cleanupError.message);
      }
      
      this.lastSyncTime = new Date();
      await this.saveConfig();
      
      const syncResult = {
        success: true,
        timestamp: this.lastSyncTime,
        localChanges: result.pushed || 0,  // 使用 localChanges 而不是 pushed
        remoteChanges: result.pulled || 0,  // 使用 remoteChanges 而不是 pulled
        conflicts: (result.conflicts || []).length,  // 冲突数量
        images: imagesSyncResult || { uploaded: 0, downloaded: 0, total: 0 }
      };
      
      this.emit('syncComplete', syncResult);
      console.log('[同步] 增量同步完成:', syncResult);
      
      return syncResult;
    } catch (error) {
      console.error('[同步] 同步失败:', error);
      console.error('[同步] 错误堆栈:', error.stack);
      
      // 如果启用了回退，尝试全量同步
      if (this.incrementalSync.useFullSyncFallback) {
        console.warn('[同步] 增量同步失败，尝试回退到全量同步...');
        // 注意：不要在这里触发 syncError，让全量同步来决定最终结果
        try {
          const fullSyncResult = await super.sync();
          // 全量同步成功后，创建同步初始化标记
          if (fullSyncResult.success) {
            await this._markSyncInitialized();
            console.log('[同步] 已回退到全量同步并成功完成');
          }
          return fullSyncResult;
        } catch (fallbackError) {
          console.error('[同步] 全量同步也失败:', fallbackError);
          console.error('[同步] 全量同步错误堆栈:', fallbackError.stack);
          // 只有在回退也失败时才触发错误事件
          this.emit('syncError', fallbackError);
          return { 
            success: false, 
            message: fallbackError.message,
            error: fallbackError.message 
          };
        }
      }
      
      // 没有回退机制，直接触发错误事件
      this.emit('syncError', error);
      return { 
        success: false, 
        message: error.message,
        error: error.message 
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 标记同步已初始化（首次全量同步成功后调用）
   */
  async _markSyncInitialized() {
    const fs = require('fs');
    const syncMarkerPath = path.join(app.getPath('userData'), 'sync-initialized.marker');
    fs.writeFileSync(syncMarkerPath, new Date().toISOString());
    console.log('[同步] 已创建同步初始化标记');
  }

  /**
   * 使用本地版本解决冲突
   */
  async resolveConflictWithLocal(conflict) {
    // 本地版本优先，不需要做任何事情
    console.log(`冲突解决：使用本地版本 (${conflict.table}:${conflict.local.id})`);
  }

  /**
   * 使用远程版本解决冲突
   */
  async resolveConflictWithRemote(conflict) {
    const DatabaseManager = require('../dao/DatabaseManager');
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.db;
    
    await this.updateRemoteItem(db, conflict.table, conflict.remote);
    console.log(`冲突解决：使用远程版本 (${conflict.table}:${conflict.remote.id})`);
  }

  /**
   * 智能合并解决冲突
   */
  async resolveConflictWithMerge(conflict) {
    const DatabaseManager = require('../dao/DatabaseManager');
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.db;
    
    // 使用 ConflictResolver 进行三向合并
    // 尝试获取共同祖先版本（如果有的话）
    const base = null; // TODO: 从版本历史获取
    
    const result = base 
      ? ConflictResolver.threeWayMerge(base, conflict.local, conflict.remote)
      : { merged: ConflictResolver.simpleMerge(conflict.local, conflict.remote), conflicts: null };
    
    if (result.conflicts && result.conflicts.length > 0) {
      console.warn(`冲突解决：检测到 ${result.conflicts.length} 个字段冲突`, result.conflicts);
      // 可以在这里触发事件，让UI层处理
      this.emit('conflictDetected', {
        table: conflict.table,
        id: conflict.local.id,
        conflicts: result.conflicts,
        merged: result.merged
      });
    }
    
    // 使用合并后的版本
    await this.updateRemoteItem(db, conflict.table, result.merged);
    console.log(`冲突解决：智能合并完成 (${conflict.table}:${result.merged.id})`);
  }

  /**
   * 获取同步状态
   */
  getStatus() {
    return {
      serviceName: this.serviceName,
      isEnabled: this.isEnabled,
      isAuthenticated: this.provider.isAuthenticated,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      autoSync: this.config.autoSync,
      config: this.config // 返回完整的配置对象，包括 syncImages 等设置
    };
  }

  // =============== 版本管理方法 ===============

  /**
   * 手动创建版本备份
   */
  async createManualVersion(description = '') {
    if (!this.isEnabled || !this.provider.isAuthenticated) {
      throw new Error('同步服务未启用或未认证');
    }

    try {
      const localData = await this.getLocalData();
      const result = await this.provider.createVersion(localData, description || '手动备份');
      console.log('手动版本创建成功:', result);
      return result;
    } catch (error) {
      console.error('手动创建版本失败:', error);
      throw error;
    }
  }

  /**
   * 获取版本列表
   */
  async getVersionList() {
    if (!this.isEnabled || !this.provider.isAuthenticated) {
      throw new Error('同步服务未启用或未认证');
    }

    try {
      return await this.provider.getVersions();
    } catch (error) {
      console.error('获取版本列表失败:', error);
      throw error;
    }
  }

  /**
   * 恢复到指定版本
   */
  async restoreToVersion(fileName) {
    if (!this.isEnabled || !this.provider.isAuthenticated) {
      throw new Error('同步服务未启用或未认证');
    }

    try {
      // 首先创建当前数据的备份版本
      const localData = await this.getLocalData();
      await this.provider.createVersion(localData, '恢复前自动备份');
      
      // 恢复到指定版本
      const restoredData = await this.provider.restoreVersion(fileName);
      
      // 将恢复的数据应用到本地数据库
      await this.applyRestoredData(restoredData);
      
      console.log('版本恢复成功:', fileName);
      return restoredData;
    } catch (error) {
      console.error('版本恢复失败:', error);
      throw error;
    }
  }

  /**
   * 删除指定版本
   */
  async deleteVersion(fileName) {
    if (!this.isEnabled || !this.provider.isAuthenticated) {
      throw new Error('同步服务未启用或未认证');
    }

    try {
      return await this.provider.deleteVersion(fileName);
    } catch (error) {
      console.error('删除版本失败:', error);
      throw error;
    }
  }

  /**
   * 获取版本详情
   */
  async getVersionDetails(fileName) {
    if (!this.isEnabled || !this.provider.isAuthenticated) {
      throw new Error('同步服务未启用或未认证');
    }

    try {
      return await this.provider.getVersionData(fileName);
    } catch (error) {
      console.error('获取版本详情失败:', error);
      throw error;
    }
  }

  /**
   * 应用恢复的数据到本地数据库
   */
  async applyRestoredData(restoredData) {
    const DatabaseManager = require('../dao/DatabaseManager');
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.db;

    try {
      // 开始事务
      db.exec('BEGIN TRANSACTION');

      // 清空现有数据
      const tables = ['notes', 'todos', 'settings', 'categories', 'tags'];
      for (const table of tables) {
        db.prepare(`DELETE FROM ${table}`).run();
      }

      // 插入恢复的数据
      for (const table of tables) {
        const items = restoredData[table] || [];
        for (const item of items) {
          await this.insertRemoteItem(db, table, item);
        }
      }

      // 提交事务
      db.exec('COMMIT');
      console.log('数据恢复到本地数据库成功');
    } catch (error) {
      // 回滚事务
      db.exec('ROLLBACK');
      console.error('应用恢复数据失败:', error);
      throw error;
    }
  }

  /**
   * 手动同步图片
   */
  async syncImagesOnly() {
    if (!this.isEnabled || !this.provider.isAuthenticated) {
      throw new Error('同步服务未启用或未认证');
    }

    try {
      return await this.imageSync.syncImages();
    } catch (error) {
      console.error('图片同步失败:', error);
      throw error;
    }
  }

  /**
   * 上传单个图片
   */
  async uploadImage(localPath, relativePath) {
    if (!this.isEnabled || !this.provider.isAuthenticated) {
      throw new Error('同步服务未启用或未认证');
    }

    try {
      return await this.imageSync.uploadImage(localPath, relativePath);
    } catch (error) {
      console.error('上传图片失败:', error);
      throw error;
    }
  }

  /**
   * 下载单个图片
   */
  async downloadImage(relativePath, localPath) {
    if (!this.isEnabled || !this.provider.isAuthenticated) {
      throw new Error('同步服务未启用或未认证');
    }

    try {
      return await this.imageSync.downloadImage(relativePath, localPath);
    } catch (error) {
      console.error('下载图片失败:', error);
      throw error;
    }
  }

  /**
   * 清理云端旧的变更文件（滚动窗口策略）
   * @param {number} maxFiles - 保留的最大文件数量
   */
  async cleanupOldChangeFiles(maxFiles = 50) {
    if (!this.provider.isAuthenticated) {
      await this.provider.authenticate();
    }

    try {
      // 修正路径：变更文件在 /FlashNote/incremental/ 目录下，不是 /incremental/changes/
      const changesPath = '/FlashNote/incremental';
      const fullUrl = this.provider.baseUrl + changesPath;
      console.log(`[变更文件清理] 开始清理，保留最近 ${maxFiles} 个文件...`);

      // 1. 列出所有变更文件
      const response = await axios({
        method: 'PROPFIND',
        url: fullUrl,
        auth: {
          username: this.provider.username,
          password: this.provider.password
        },
        headers: {
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      });

      const files = this.provider._parseWebDAVResponse(response.data);
      
      // 2. 过滤出变更文件（以 changes- 开头的 JSON 文件）
      const changeFiles = files.filter(file => {
        const filename = file.path.split('/').pop() || '';
        return filename.startsWith('changes-') && filename.endsWith('.json');
      });

      console.log(`[变更文件清理] 找到 ${changeFiles.length} 个变更文件`);

      // 3. 如果文件数量超过限制，删除最旧的
      if (changeFiles.length > maxFiles) {
        // 按修改时间排序（最新的在前）
        changeFiles.sort((a, b) => {
          const timeA = new Date(a.lastModified || 0).getTime();
          const timeB = new Date(b.lastModified || 0).getTime();
          return timeB - timeA;
        });

        // 获取需要删除的文件（超出限制的旧文件）
        const filesToDelete = changeFiles.slice(maxFiles);
        console.log(`[变更文件清理] 需要删除 ${filesToDelete.length} 个旧文件`);

        // 4. 逐个删除
        let deletedCount = 0;
        for (const file of filesToDelete) {
          try {
            const deleteUrl = this.provider.baseUrl + file.path;
            await axios({
              method: 'DELETE',
              url: deleteUrl,
              auth: {
                username: this.provider.username,
                password: this.provider.password
              }
            });
            deletedCount++;
            console.log(`[变更文件清理] 已删除: ${file.path}`);
          } catch (error) {
            console.error(`[变更文件清理] 删除失败 ${file.path}:`, error.message);
          }
        }

        console.log(`[变更文件清理] 完成，删除了 ${deletedCount}/${filesToDelete.length} 个旧变更文件`);
        return deletedCount;
      }

      console.log('[变更文件清理] 文件数量未超限，无需清理');
      return 0;

    } catch (error) {
      // 404 表示目录不存在，这是正常的
      if (error.response?.status === 404) {
        console.log('[变更文件清理] 变更目录不存在，跳过清理');
        return 0;
      }
      console.error('[变更文件清理] 清理失败:', error.message);
      // 不抛出错误，避免影响主同步流程
      return 0;
    }
  }

  /**
   * 清理所有变更文件（用于手动清理或重置）
   */
  async cleanupAllChangeFiles() {
    if (!this.provider.isAuthenticated) {
      await this.provider.authenticate();
    }

    try {
      const changesPath = '/FlashNote/incremental';
      const fullUrl = this.provider.baseUrl + changesPath;
      console.log('[变更文件清理] 开始清理所有变更文件...');

      // 1. 列出所有变更文件
      const response = await axios({
        method: 'PROPFIND',
        url: fullUrl,
        auth: {
          username: this.provider.username,
          password: this.provider.password
        },
        headers: {
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      });

      const files = this.provider._parseWebDAVResponse(response.data);
      
      // 2. 过滤出变更文件
      const changeFiles = files.filter(file => {
        const filename = file.path.split('/').pop() || '';
        return filename.startsWith('changes-') && filename.endsWith('.json');
      });

      console.log(`[变更文件清理] 找到 ${changeFiles.length} 个变更文件，准备全部删除`);

      // 3. 逐个删除
      let deletedCount = 0;
      for (const file of changeFiles) {
        try {
          const deleteUrl = this.provider.baseUrl + file.path;
          await axios({
            method: 'DELETE',
            url: deleteUrl,
            auth: {
              username: this.provider.username,
              password: this.provider.password
            }
          });
          deletedCount++;
        } catch (error) {
          console.error(`[变更文件清理] 删除失败 ${file.path}:`, error.message);
        }
      }

      console.log(`[变更文件清理] 完成，删除了 ${deletedCount}/${changeFiles.length} 个变更文件`);
      return { deleted: deletedCount, total: changeFiles.length };

    } catch (error) {
      if (error.response?.status === 404) {
        console.log('[变更文件清理] 变更目录不存在');
        return { deleted: 0, total: 0 };
      }
      console.error('[变更文件清理] 清理失败:', error.message);
      throw error;
    }
  }
}

module.exports = NutCloudSyncService;