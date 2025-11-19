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
        }
      });
    } catch (error) {
      // 文件夹已存在时会返回405错误，这是正常的
      if (error.response?.status !== 405) {
        console.warn('创建应用文件夹失败:', error.message);
      }
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
        try {
          await this.createVersion(data, versionCheck.reason);
        } catch (error) {
          console.warn('创建版本备份失败，但继续上传数据:', error);
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
    if (!this.isAuthenticated) {
      // 如果没有凭据，先尝试加载保存的凭据
      if (!this.username || !this.password) {
        await this.loadCredentials();
      }
      await this.authenticate();
    }

    try {
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
        try {
          // 现在response.data应该是字符串，需要解析为JSON
          const result = JSON.parse(response.data);
          console.log('从坚果云下载数据成功');
          
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
          console.error('解析JSON数据失败:', parseError);
          console.log('原始响应数据:', response.data);
          throw new Error(`数据格式错误: ${parseError.message}`);
        }
      }
    } catch (error) {
      if (error.response?.status === 404) {
        // 文件不存在，返回null表示首次同步
        console.log('坚果云上没有找到数据文件，这可能是首次同步');
        return null;
      }
      console.error('从坚果云下载失败:', error);
      
      // 改进错误信息处理
      let errorMessage = error.message;
      if (error.response?.data) {
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
        }
      });

      return response.status === 200;
    } catch (error) {
      return false;
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
      return null;
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
          version: versionNumber,
          fileName: fileName,
          timestamp: versionData.timestamp,
          description: versionData.description
        };
      }
    } catch (error) {
      console.error('创建版本失败:', error);
      throw new Error(`创建版本失败: ${error.message}`);
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
   */
  calculateDataChangePercentage(oldData, newData) {
    const tables = ['notes', 'todos', 'settings', 'categories', 'tags'];
    let totalOldItems = 0;
    let totalChanges = 0;

    for (const table of tables) {
      const oldItems = oldData[table] || [];
      const newItems = newData[table] || [];
      
      totalOldItems += oldItems.length;
      
      // 简单的变化检测：比较数量差异
      const quantityChange = Math.abs(oldItems.length - newItems.length);
      totalChanges += quantityChange;
    }

    if (totalOldItems === 0) return 100;
    return (totalChanges / totalOldItems) * 100;
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
        }
      });

      if (response.status === 201 || response.status === 204) {
        console.log(`上传变更包成功: ${filepath}`);
        return true;
      }
    } catch (error) {
      console.error(`上传变更包失败: ${filepath}`, error);
      throw error;
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
      
      // 过滤出在指定时间之后的变更文件
      const sinceTime = new Date(since).getTime();
      const recentFiles = files.filter(file => {
        const fileTime = new Date(file.lastModified).getTime();
        return fileTime > sinceTime;
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
        // 增量文件夹不存在，返回空列表
        return [];
      }
      console.error('下载远程变更失败:', error);
      throw error;
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
        }
      });
    } catch (error) {
      // 405或409表示文件夹已存在，这是正常的
      if (error.response?.status !== 405 && error.response?.status !== 409) {
        throw error;
      }
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
    // 获取数据库实例，优先使用传入的参数，否则自己获取
    let db = dbParam;
    if (!db || typeof db.prepare !== 'function') {
      const DatabaseManager = require('../dao/DatabaseManager');
      const dbManager = DatabaseManager.getInstance();
      db = dbManager.db;
    }

    const tables = {
      notes: 'INSERT OR REPLACE INTO notes (id, title, content, tags, category, is_pinned, is_deleted, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      todos: 'INSERT OR REPLACE INTO todos (id, content, tags, is_completed, is_important, is_urgent, due_date, focus_time_seconds, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      settings: 'INSERT OR REPLACE INTO settings (key, value, type, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      categories: 'INSERT OR REPLACE INTO categories (id, name, color, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      tags: 'INSERT OR REPLACE INTO tags (id, name, color, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    };

    const stmt = db.prepare(tables[table]);
    
    if (table === 'notes') {
      stmt.run(data.id, data.title, data.content, data.tags, data.category, data.is_pinned, data.is_deleted, data.created_at, data.updated_at, data.deleted_at);
    } else if (table === 'todos') {
      stmt.run(data.id, data.content, data.tags, data.is_completed, data.is_important, data.is_urgent, data.due_date, data.focus_time_seconds, data.created_at, data.updated_at, data.completed_at);
    } else if (table === 'settings') {
      stmt.run(data.key, data.value, data.type, data.description, data.created_at, data.updated_at);
    } else if (table === 'categories') {
      stmt.run(data.id, data.name, data.color, data.icon, data.sort_order, data.created_at, data.updated_at);
    } else if (table === 'tags') {
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
    if (!this.isEnabled || this.isSyncing) {
      return { success: false, message: '同步服务未启用或正在同步中' };
    }

    this.isSyncing = true;
    this.emit('syncStart');
    
    try {
      console.log('[同步] 开始增量同步...');
      
      // 使用增量同步服务
      const result = await this.incrementalSync.performIncrementalSync();
      
      // 如果增量同步失败，回退到全量同步
      if (!result.success && this.incrementalSync.useFullSyncFallback) {
        console.warn('[同步] 增量同步失败，回退到全量同步');
        return await super.sync(); // 调用父类的全量同步
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
      try {
        await this.cleanupOldChangeFiles(50); // 保留最近50个变更文件
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
      this.emit('syncError', error);
      
      // 如果启用了回退，尝试全量同步
      if (this.incrementalSync.useFullSyncFallback) {
        console.warn('[同步] 尝试回退到全量同步...');
        try {
          return await super.sync();
        } catch (fallbackError) {
          console.error('[同步] 全量同步也失败:', fallbackError);
          return { success: false, error: fallbackError.message };
        }
      }
      
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
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
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const changesPath = '/FlashNote/incremental/changes';
      const fullUrl = this.baseUrl + changesPath;
      console.log(`[变更文件清理] 开始清理，保留最近 ${maxFiles} 个文件...`);
      console.log(`[变更文件清理] 请求URL: ${fullUrl}`);

      // 1. 列出所有变更文件
      const response = await axios({
        method: 'PROPFIND',
        url: fullUrl,
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      });

      console.log(`[变更文件清理] PROPFIND 响应状态: ${response.status}`);
      console.log(`[变更文件清理] PROPFIND 响应状态: ${response.status}`);
      const files = await this._parseWebDAVResponse(response.data);
      
      console.log(`[变更文件清理] 解析到 ${files.length} 个文件/目录`);
      
      // 2. 过滤出变更文件（排除目录）
      const changeFiles = files.filter(file => {
        const isChangeFile = !file.isDirectory && 
          file.href.includes('/incremental/changes/') &&
          file.href.endsWith('.json');
        if (isChangeFile) {
          console.log(`[变更文件清理] 变更文件: ${file.href}, 修改时间: ${file.lastModified}`);
        }
        return isChangeFile;
      });

      console.log(`[变更文件清理] 找到 ${changeFiles.length} 个变更文件`);

      // 3. 如果文件数量超过限制，删除最旧的
      if (changeFiles.length > maxFiles) {
        // 按修改时间排序（最新的在前）
        changeFiles.sort((a, b) => {
          const timeA = a.lastModified ? a.lastModified.getTime() : 0;
          const timeB = b.lastModified ? b.lastModified.getTime() : 0;
          return timeB - timeA;
        });

        // 获取需要删除的文件（超出限制的旧文件）
        const filesToDelete = changeFiles.slice(maxFiles);
        console.log(`[变更文件清理] 需要删除 ${filesToDelete.length} 个旧文件`);

        // 4. 逐个删除
        let deletedCount = 0;
        for (const file of filesToDelete) {
          try {
            await axios({
              method: 'DELETE',
              url: this.baseUrl + file.href,
              auth: {
                username: this.username,
                password: this.password
              }
            });
            deletedCount++;
            console.log(`[变更文件清理] 已删除: ${file.href}`);
          } catch (error) {
            console.error(`[变更文件清理] 删除失败 ${file.href}:`, error.message);
          }
        }

        console.log(`[变更文件清理] 完成，删除了 ${deletedCount} 个旧变更文件`);
        return deletedCount;
      }

      console.log('[变更文件清理] 文件数量未超限，无需清理');
      return 0;

    } catch (error) {
      // 404 表示目录不存在，这是正常的
      if (error.response?.status === 404) {
        console.log('[变更文件清理] 变更目录不存在，跳过清理');
        console.log('[变更文件清理] 请求URL:', error.config?.url);
        return 0;
      }
      console.error('[变更文件清理] 清理失败:', error.message);
      console.error('[变更文件清理] 错误详情:', error.response?.status, error.response?.statusText);
      // 不抛出错误，避免影响主同步流程
      return 0;
    }
  }
}

module.exports = NutCloudSyncService;