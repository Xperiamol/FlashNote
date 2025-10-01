const CloudSyncService = require('./CloudSyncService');
const axios = require('axios');
const { app, shell } = require('electron');
const crypto = require('crypto');

/**
 * OneDrive同步服务提供商
 * 基于Microsoft Graph API实现
 */
class OneDriveProvider {
  constructor() {
    this.clientId = 'your-client-id'; // 需要注册Microsoft应用获取
    this.redirectUri = 'http://localhost:8080/auth/callback';
    this.scopes = 'Files.ReadWrite.AppFolder offline_access';
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.appFolder = 'FlashNote';
    this.dataFile = 'flashnote-data.json';
    this.isAuthenticated = false;
  }

  /**
   * 开始OAuth认证流程
   */
  async authenticate() {
    try {
      // 如果已有有效token，直接使用
      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        this.isAuthenticated = true;
        return true;
      }

      // 如果有refresh token，尝试刷新
      if (this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          this.isAuthenticated = true;
          return true;
        }
      }

      // 开始新的认证流程
      const authUrl = this.generateAuthUrl();
      
      // 在默认浏览器中打开认证URL
      await shell.openExternal(authUrl);
      
      // 等待用户完成认证（这里需要实现回调处理）
      return new Promise((resolve, reject) => {
        // 实际实现中需要启动本地服务器接收回调
        // 这里简化处理
        setTimeout(() => {
          reject(new Error('认证超时，请重试'));
        }, 60000);
      });
    } catch (error) {
      this.isAuthenticated = false;
      throw new Error(`OneDrive认证失败: ${error.message}`);
    }
  }

  /**
   * 生成认证URL
   */
  generateAuthUrl() {
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.scopes,
      state: state
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * 交换授权码获取访问令牌
   */
  async exchangeCodeForTokens(code) {
    try {
      const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: this.clientId,
        code: code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const data = response.data;
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);
      this.isAuthenticated = true;

      // 保存token到本地
      await this.saveTokens();

      return true;
    } catch (error) {
      throw new Error(`获取访问令牌失败: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: this.clientId,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const data = response.data;
      this.accessToken = data.access_token;
      if (data.refresh_token) {
        this.refreshToken = data.refresh_token;
      }
      this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);

      await this.saveTokens();
      return true;
    } catch (error) {
      console.error('刷新token失败:', error);
      this.clearTokens();
      return false;
    }
  }

  /**
   * 确保应用文件夹存在
   */
  async ensureAppFolder() {
    try {
      // 检查应用文件夹是否存在
      const response = await axios.get(`${this.baseUrl}/me/drive/special/approot:/${this.appFolder}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return response.data.id;
    } catch (error) {
      if (error.response?.status === 404) {
        // 创建应用文件夹
        const createResponse = await axios.post(`${this.baseUrl}/me/drive/special/approot/children`, {
          name: this.appFolder,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename'
        }, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        return createResponse.data.id;
      }
      throw error;
    }
  }

  /**
   * 上传数据
   */
  async upload(data) {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      await this.ensureAppFolder();

      const jsonData = JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
        version: '1.0'
      }, null, 2);

      const response = await axios.put(
        `${this.baseUrl}/me/drive/special/approot:/${this.appFolder}/${this.dataFile}:/content`,
        jsonData,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 200 || response.status === 201) {
        console.log('数据上传到OneDrive成功');
        return true;
      }
    } catch (error) {
      console.error('上传到OneDrive失败:', error);
      throw new Error(`上传失败: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * 下载数据
   */
  async download() {
    if (!this.isAuthenticated) {
      await this.authenticate();
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/me/drive/special/approot:/${this.appFolder}/${this.dataFile}:/content`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (response.status === 200) {
        const result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        console.log('从OneDrive下载数据成功');
        return result.data;
      }
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('OneDrive上没有找到数据文件，这可能是首次同步');
        return null;
      }
      console.error('从OneDrive下载失败:', error);
      throw new Error(`下载失败: ${error.response?.data?.error?.message || error.message}`);
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
      const response = await axios.get(
        `${this.baseUrl}/me/drive/special/approot:/${this.appFolder}/${this.dataFile}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

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
      const response = await axios.get(
        `${this.baseUrl}/me/drive/special/approot:/${this.appFolder}/${this.dataFile}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (response.status === 200) {
        const file = response.data;
        return {
          exists: true,
          lastModified: new Date(file.lastModifiedDateTime),
          size: file.size
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
   * 保存tokens到本地
   */
  async saveTokens() {
    const tokenData = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry
    };

    const tokenPath = path.join(app.getPath('userData'), 'onedrive-tokens.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
  }

  /**
   * 从本地加载tokens
   */
  async loadTokens() {
    const tokenPath = path.join(app.getPath('userData'), 'onedrive-tokens.json');
    
    if (fs.existsSync(tokenPath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      this.accessToken = tokenData.accessToken;
      this.refreshToken = tokenData.refreshToken;
      this.tokenExpiry = tokenData.tokenExpiry ? new Date(tokenData.tokenExpiry) : null;
    }
  }

  /**
   * 清除tokens
   */
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.isAuthenticated = false;

    const tokenPath = path.join(app.getPath('userData'), 'onedrive-tokens.json');
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  }
}

/**
 * OneDrive同步服务
 */
class OneDriveSyncService extends CloudSyncService {
  constructor() {
    const provider = new OneDriveProvider();
    super(provider);
    this.serviceName = 'OneDrive';
  }

  /**
   * 初始化服务
   */
  async initialize() {
    await this.provider.loadTokens();
    await super.initialize();
  }

  /**
   * 配置OneDrive连接
   */
  async configure() {
    try {
      await this.provider.authenticate();
      return { success: true, message: 'OneDrive配置成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * 获取所有本地更改
   */
  getAllLocalChanges(localData) {
    const changes = [];
    
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
  async insertRemoteItem(db, table, data) {
    // 复用坚果云服务的实现
    const NutCloudSyncService = require('./NutCloudSyncService');
    const nutCloudService = new NutCloudSyncService();
    return await nutCloudService.insertRemoteItem(db, table, data);
  }

  /**
   * 更新远程项目
   */
  async updateRemoteItem(db, table, data) {
    await this.insertRemoteItem(db, table, data);
  }

  /**
   * 删除远程项目
   */
  async deleteRemoteItem(db, table, data) {
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    stmt.run(data.id);
  }

  /**
   * 使用本地版本解决冲突
   */
  async resolveConflictWithLocal(conflict) {
    console.log(`冲突解决：使用本地版本 (${conflict.table}:${conflict.local.id})`);
  }

  /**
   * 使用远程版本解决冲突
   */
  async resolveConflictWithRemote(conflict) {
    const DatabaseManager = require('../dao/DatabaseManager');
    const db = DatabaseManager.getInstance();
    
    await this.updateRemoteItem(db, conflict.table, conflict.remote);
    console.log(`冲突解决：使用远程版本 (${conflict.table}:${conflict.remote.id})`);
  }

  /**
   * 智能合并解决冲突
   */
  async resolveConflictWithMerge(conflict) {
    const DatabaseManager = require('../dao/DatabaseManager');
    const db = DatabaseManager.getInstance();
    
    const merged = { ...conflict.remote };
    
    for (const key in conflict.local) {
      if (conflict.local[key] && (!conflict.remote[key] || conflict.local[key].length > conflict.remote[key].length)) {
        merged[key] = conflict.local[key];
      }
    }
    
    merged.updated_at = new Date().toISOString();
    
    await this.updateRemoteItem(db, conflict.table, merged);
    console.log(`冲突解决：智能合并 (${conflict.table}:${merged.id})`);
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
      autoSync: this.config.autoSync
    };
  }

  /**
   * 登出
   */
  async logout() {
    this.provider.clearTokens();
    await this.disable();
  }
}

module.exports = OneDriveSyncService;