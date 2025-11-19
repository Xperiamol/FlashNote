const axios = require('axios');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const crypto = require('crypto');

/**
 * 延迟函数
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 坚果云图片同步服务
 * 基于 WebDAV 协议实现图片的云端存储和同步
 */
class NutCloudImageSync {
  constructor(nutCloudProvider) {
    this.provider = nutCloudProvider;
    this.imagesFolder = '/FlashNote/images'; // 云端图片文件夹
    this.whiteboardFolder = '/FlashNote/images/whiteboard'; // 白板图片文件夹
    this.imageMetadataFile = '/FlashNote/image-metadata.json'; // 图片元数据
    this.localImagesDir = null; // 本地图片目录，初始化时设置
    this.localWhiteboardDir = null; // 本地白板图片目录
    this.requestDelay = 200; // 请求间隔(毫秒)，避免触发限流
    this.maxRetries = 3; // 最大重试次数
    this.foldersEnsured = false; // 标记目录是否已创建
  }

  /**
   * 初始化服务
   */
  async initialize(localImagesDir, localWhiteboardDir) {
    this.localImagesDir = localImagesDir;
    this.localWhiteboardDir = localWhiteboardDir;
    
    // 不在初始化时创建目录，延迟到第一次使用时
    // 避免在未启用图片同步时也创建目录
  }

  /**
   * 确保云端文件夹存在
   * WebDAV的MKCOL只能创建一级目录，需要逐级创建
   */
  async ensureCloudFolders() {
    // 如果已经确认目录存在，直接返回
    if (this.foldersEnsured) {
      return;
    }
    
    console.log('[图片同步] 检查并创建云端目录...');
    
    // 需要按顺序创建的目录层级
    const foldersToCreate = [
      '/FlashNote',              // 1. 先创建根目录
      '/FlashNote/images',       // 2. 再创建images目录
      '/FlashNote/images/whiteboard'  // 3. 最后创建whiteboard子目录
    ];
    
    for (const folder of foldersToCreate) {
      try {
        // 先尝试检查目录是否存在（使用PROPFIND）
        try {
          await axios({
            method: 'PROPFIND',
            url: this.provider.baseUrl + folder,
            auth: {
              username: this.provider.username,
              password: this.provider.password
            },
            headers: {
              'Depth': '0'
            },
            timeout: 5000
          });
          // 目录存在，继续下一个
          console.log(`[图片同步] 目录已存在: ${folder}`);
          continue;
        } catch (checkError) {
          // 404表示不存在，需要创建
          if (checkError.response?.status !== 404) {
            // 其他错误，假定目录存在
            console.log(`[图片同步] 无法检查目录 ${folder}, 假定存在`);
            continue;
          }
        }
        
        // 目录不存在，创建它
        await axios({
          method: 'MKCOL',
          url: this.provider.baseUrl + folder,
          auth: {
            username: this.provider.username,
            password: this.provider.password
          },
          timeout: 10000
        });
        
        console.log(`[图片同步] 成功创建目录: ${folder}`);
        
      } catch (error) {
        // 405表示方法不允许(目录已存在) - 正常
        if (error.response?.status === 405) {
          console.log(`[图片同步] 目录已存在(405): ${folder}`);
          continue;
        }
        
        // 其他错误记录警告但继续
        console.warn(`[图片同步] 创建目录${folder}时出错(${error.response?.status || error.code || 'unknown'}), 继续尝试`);
      }
      
      // 请求间隔，避免触发限流
      await delay(this.requestDelay);
    }
    
    this.foldersEnsured = true;
    console.log('[图片同步] 云端目录准备完成');
  }

  /**
   * 上传单个图片到坚果云
   * @param {string} localPath - 本地图片路径
   * @param {string} relativePath - 相对路径（如 images/xxx.png）
   * @returns {Promise<string>} 云端 URL
   */
  async uploadImage(localPath, relativePath) {
    if (!this.provider.isAuthenticated) {
      throw new Error('坚果云未认证');
    }
    
    // 读取本地图片文件
    const imageBuffer = await fsPromises.readFile(localPath);
    
    // 构建云端路径：/FlashNote/images/ + relativePath
    // relativePath 可能是 "abc.png" 或 "whiteboard/xyz.png"
    const cloudPath = `/FlashNote/images/${relativePath}`;
    
    // 带重试的上传逻辑
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const response = await axios({
          method: 'PUT',
          url: this.provider.baseUrl + cloudPath,
          auth: {
            username: this.provider.username,
            password: this.provider.password
          },
          data: imageBuffer,
          headers: {
            'Content-Type': this.getMimeType(path.extname(localPath))
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 30000 // 30秒超时
        });

        if (response.status === 201 || response.status === 204) {
          if (retries > 0) {
            console.log(`[图片同步] 重试上传成功: ${relativePath}`);
          }
          return `app://${relativePath}`;
        }
      } catch (error) {
        // 503错误：服务器繁忙，重试
        if (error.response?.status === 503 && retries < this.maxRetries - 1) {
          retries++;
          const waitTime = retries * 2000; // 2s, 4s, 6s
          console.warn(`[图片同步] 服务器繁忙(503)，${waitTime}ms后重试上传 ${relativePath} (${retries}/${this.maxRetries})`);
          await delay(waitTime);
          continue;
        }
        
        // 409错误：目录不存在或冲突，跳过此文件
        if (error.response?.status === 409) {
          console.warn(`[图片同步] 上传失败(409): ${cloudPath}`);
          return null;
        }
        
        // 其他错误或重试次数用尽
        console.error(`[图片同步] 上传图片失败 (${relativePath}):`, error.message);
        return null;
      }
    }
    
    return null;
  }

  /**
   * 下载单个图片从坚果云
   * @param {string} relativePath - 相对路径（如 images/xxx.png）
   * @param {string} localPath - 本地保存路径
   */
  async downloadImage(relativePath, localPath) {
    if (!this.provider.isAuthenticated) {
      throw new Error('坚果云未认证');
    }

    try {
      // 构建云端路径：/FlashNote/images/ + relativePath
      // relativePath 可能是 "abc.png" 或 "whiteboard/xyz.png"
      const cloudPath = `/FlashNote/images/${relativePath}`;
      
      const response = await axios({
        method: 'GET',
        url: this.provider.baseUrl + cloudPath,
        auth: {
          username: this.provider.username,
          password: this.provider.password
        },
        responseType: 'arraybuffer'
      });

      if (response.status === 200) {
        // 确保本地目录存在
        await fsPromises.mkdir(path.dirname(localPath), { recursive: true });
        
        // 保存到本地
        await fsPromises.writeFile(localPath, response.data);
        console.log(`图片下载成功: ${relativePath}`);
        return true;
      }
    } catch (error) {
      if (error.response?.status === 404) {
        console.warn(`云端图片不存在: ${relativePath}`);
        return false;
      }
      console.error(`下载图片失败 (${relativePath}):`, error.message);
      throw error;
    }
  }

  /**
   * 同步所有图片（双向同步）
   */
  async syncImages() {
    if (!this.provider.isAuthenticated) {
      throw new Error('坚果云未认证');
    }

    console.log('[图片同步] 开始同步图片...');
    
    try {
      // 1. 获取本地图片列表（需要计算 hash 用于比对）
      const localImages = await this.scanLocalImages(true);
      console.log(`[图片同步] 本地图片: ${localImages.length} 个`);
      
      // 2. 获取云端图片元数据
      const cloudMetadata = await this.getCloudImageMetadata();
      console.log(`[图片同步] 云端图片: ${Object.keys(cloudMetadata).length} 个`);
      
      // 3. 比对并同步
      const toUpload = [];
      const toDownload = [];
      
      // 上传本地新增/修改的图片
      for (const localImage of localImages) {
        const cloudInfo = cloudMetadata[localImage.relativePath];
        
        if (!cloudInfo) {
          // 云端不存在，上传
          toUpload.push(localImage);
        } else if (localImage.hash !== cloudInfo.hash) {
          // 哈希不同，比较时间决定方向
          if (new Date(localImage.mtime) > new Date(cloudInfo.mtime)) {
            // 本地更新，上传
            toUpload.push(localImage);
          } else {
            // 云端更新，下载
            toDownload.push({ relativePath: localImage.relativePath, localPath: localImage.fullPath });
          }
        }
      }
      
      // 下载云端新增的图片
      for (const [relativePath, cloudInfo] of Object.entries(cloudMetadata)) {
        const localExists = localImages.some(img => img.relativePath === relativePath);
        if (!localExists) {
          const localPath = path.join(
            relativePath.startsWith('images/whiteboard/') ? this.localWhiteboardDir : this.localImagesDir,
            path.basename(relativePath)
          );
          toDownload.push({ relativePath, localPath });
        }
      }
      
      console.log(`[图片同步] 待上传: ${toUpload.length} 个, 待下载: ${toDownload.length} 个`);
      
      // 确保云端目录存在（只调用一次）
      if (toUpload.length > 0) {
        await this.ensureCloudFolders();
      }
      
      // 串行上传，避免并发过多触发限流
      let uploadedCount = 0;
      let uploadFailedCount = 0;
      
      for (let i = 0; i < toUpload.length; i++) {
        const localImage = toUpload[i];
        try {
          console.log(`[图片同步] 上传 ${i + 1}/${toUpload.length}: ${localImage.relativePath}`);
          await this.uploadImage(localImage.fullPath, localImage.relativePath);
          uploadedCount++;
          
          // 每次上传后延迟，避免触发限流
          if (i < toUpload.length - 1) {
            await delay(500); // 增加到500ms延迟
          }
        } catch (error) {
          uploadFailedCount++;
          console.error(`[图片同步] 上传失败 (${localImage.relativePath}):`, error.message);
          // 不抛出错误，继续处理下一个
        }
      }
      
      // 串行下载
      let downloadedCount = 0;
      let downloadFailedCount = 0;
      
      for (let i = 0; i < toDownload.length; i++) {
        const item = toDownload[i];
        try {
          console.log(`[图片同步] 下载 ${i + 1}/${toDownload.length}: ${item.relativePath}`);
          await this.downloadImage(item.relativePath, item.localPath);
          downloadedCount++;
          
          if (i < toDownload.length - 1) {
            await delay(500);
          }
        } catch (error) {
          downloadFailedCount++;
          console.error(`[图片同步] 下载失败 (${item.relativePath}):`, error.message);
        }
      }
      
      console.log(`[图片同步] 上传完成: ${uploadedCount}/${toUpload.length}, 失败: ${uploadFailedCount}`);
      console.log(`[图片同步] 下载完成: ${downloadedCount}/${toDownload.length}, 失败: ${downloadFailedCount}`);
      
      // 4. 更新云端元数据（只有成功上传的才更新）
      if (uploadedCount > 0) {
        try {
          await this.updateCloudImageMetadata(localImages);
        } catch (error) {
          console.error('[图片同步] 更新元数据失败:', error.message);
        }
      }
      
      console.log('[图片同步] 同步完成');
      
      // 如果失败太多，给出警告
      if (uploadFailedCount > toUpload.length * 0.5 && toUpload.length > 0) {
        console.warn('[图片同步] 警告: 超过50%的图片上传失败，可能是坚果云服务器繁忙');
        console.warn('[图片同步] 建议: 稍后再试，或暂时关闭图片同步功能');
      }
      
      return {
        uploaded: uploadedCount,
        downloaded: downloadedCount,
        failed: uploadFailedCount + downloadFailedCount,
        total: toUpload.length + toDownload.length
      };
    } catch (error) {
      console.error('[图片同步] 同步失败:', error);
      throw error;
    }
  }

  /**
   * 扫描本地所有图片
   * @param {boolean} includeHash - 是否计算文件 hash（清理时不需要）
   */
  async scanLocalImages(includeHash = false) {
    const images = [];
    
    console.log('[图片扫描] localImagesDir:', this.localImagesDir);
    console.log('[图片扫描] localWhiteboardDir:', this.localWhiteboardDir);
    
    // 扫描 Markdown 图片目录
    if (this.localImagesDir) {
      console.log('[图片扫描] 开始扫描普通图片目录...');
      try {
        const markdownImages = await this.scanDirectory(this.localImagesDir, '', includeHash);  // 空前缀，只用文件名
        console.log(`[图片扫描] 找到 ${markdownImages.length} 个普通图片`);
        images.push(...markdownImages);
      } catch (error) {
        console.error('[图片扫描] 扫描普通图片失败:', error);
      }
    }
    
    // 扫描白板图片目录
    if (this.localWhiteboardDir) {
      console.log('[图片扫描] 开始扫描白板图片目录...');
      try {
        const whiteboardImages = await this.scanDirectory(this.localWhiteboardDir, 'whiteboard', includeHash);
        console.log(`[图片扫描] 找到 ${whiteboardImages.length} 个白板图片`);
        images.push(...whiteboardImages);
      } catch (error) {
        console.error('[图片扫描] 扫描白板图片失败:', error);
      }
    }
    
    console.log(`[图片扫描] 总计找到 ${images.length} 个图片`);
    console.log('[图片扫描] 准备返回图片列表...');
    console.log('[图片扫描] 返回值类型:', typeof images, '是数组:', Array.isArray(images));
    return images;
  }

  /**
   * 扫描目录
   * @param {boolean} includeHash - 是否计算文件 hash
   */
  async scanDirectory(dirPath, relativePrefix, includeHash = false) {
    console.log(`[扫描目录] 开始扫描: ${dirPath}, 前缀: "${relativePrefix}", 计算hash: ${includeHash}`);
    const images = [];
    
    try {
      console.log(`[扫描目录] 读取目录内容...`);
      const files = await fsPromises.readdir(dirPath);
      console.log(`[扫描目录] 目录包含 ${files.length} 个文件`);
      
      let processedFiles = 0;
      for (const file of files) {
        processedFiles++;
        const fullPath = path.join(dirPath, file);
        const stat = await fsPromises.stat(fullPath);
        
        if (stat.isFile() && this.isImageFile(file)) {
          console.log(`[扫描目录] 处理图片 ${processedFiles}/${files.length}: ${file}`);
          // 构建相对路径：如果有前缀则用 prefix/file，否则只用 file
          const relativePath = relativePrefix ? `${relativePrefix}/${file}` : file;
          
          const imageInfo = {
            fileName: file,
            path: fullPath,      // 用于删除
            fullPath: fullPath,  // 用于上传
            relativePath: relativePath,
            size: stat.size,
            mtime: stat.mtime.toISOString()
          };
          
          // 只在需要时计算 hash（同步时需要，清理时不需要）
          if (includeHash) {
            console.log(`[扫描目录] 计算 hash: ${file}`);
            const buffer = await fsPromises.readFile(fullPath);
            imageInfo.hash = crypto.createHash('md5').update(buffer).digest('hex');
          }
          
          images.push(imageInfo);
        }
      }
      
      console.log(`[扫描目录] 扫描完成，找到 ${images.length} 个图片文件`);
    } catch (error) {
      console.warn(`扫描目录失败 (${dirPath}):`, error.message);
      console.error('[扫描目录] 错误堆栈:', error.stack);
    }
    
    console.log(`[扫描目录] 返回 ${images.length} 个图片`);
    return images;
  }

  /**
   * 获取云端图片元数据
   */
  async getCloudImageMetadata() {
    try {
      const response = await axios({
        method: 'GET',
        url: this.provider.baseUrl + this.imageMetadataFile,
        auth: {
          username: this.provider.username,
          password: this.provider.password
        },
        responseType: 'text'
      });

      if (response.status === 200) {
        return JSON.parse(response.data);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        // 元数据文件不存在，返回空对象
        return {};
      }
      console.error('获取云端图片元数据失败:', error);
      return {};
    }
  }

  /**
   * 清理未被引用的图片
   * @param {number} retentionDays - 保留天数，默认 30 天
   */
  async cleanupUnusedImages(retentionDays = 30) {
    console.log('[图片清理] === cleanupUnusedImages 函数开始 ===');
    try {
      console.log('[图片清理] 开始扫描未引用的图片...');
      console.log('[图片清理] 本地图片目录:', this.localImagesDir);
      console.log('[图片清理] 白板图片目录:', this.localWhiteboardDir);
      
      // 1. 获取所有活跃笔记中引用的图片
      console.log('[图片清理] 步骤1: 扫描活跃笔记引用...');
      const referencedImages = await this.scanActiveNoteReferences();
      console.log(`[图片清理] 活跃笔记引用图片: ${referencedImages.size} 个`);
      console.log('[图片清理] 引用的图片列表:', Array.from(referencedImages).slice(0, 10));
      
      // 2. 扫描本地所有图片（不需要 hash，加快速度）
      console.log('[图片清理] 步骤2: 开始扫描本地图片...');
      console.log('[图片清理] 即将调用 scanLocalImages(false)...');
      
      let localImages;
      try {
        localImages = await this.scanLocalImages(false);
        console.log('[图片清理] scanLocalImages 调用成功返回');
      } catch (scanError) {
        console.error('[图片清理] scanLocalImages 调用出错:', scanError);
        throw scanError;
      }
      
      console.log('[图片清理] scanLocalImages 返回完成');
      console.log(`[图片清理] 本地图片总数: ${localImages.length} 个`);
      console.log('[图片清理] localImages 类型:', typeof localImages, '是数组:', Array.isArray(localImages));
      
      if (localImages.length > 0) {
        console.log('[图片清理] 本地图片示例:', localImages.slice(0, 3).map(img => ({
          relativePath: img.relativePath,
          fileName: img.fileName,
          mtime: img.mtime
        })));
      } else {
        console.log('[图片清理] 警告：没有找到本地图片');
        return { deletedCount: 0, totalSize: 0, orphanedImages: [] };
      }
      
      // 3. 识别未引用的图片
      console.log('[图片清理] 开始识别未引用的图片...');
      const orphanedImages = [];
      const now = Date.now();
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      
      let processedCount = 0;
      let skippedByReference = 0;
      let skippedByAge = 0;
      
      for (const image of localImages) {
        processedCount++;
        if (processedCount % 10 === 0) {
          console.log(`[图片清理] 已处理 ${processedCount}/${localImages.length} 个图片`);
        }
        
        const relativePath = image.relativePath;
        
        // 多种匹配方式：完整路径、去掉 images/ 前缀、只用文件名
        const pathVariants = [
          relativePath,  // 完整路径，如 "images/abc.png"
          relativePath.replace(/^images\//, ''),  // 去掉 images/ 前缀，如 "abc.png"
          relativePath.replace(/^images\/whiteboard\//, 'whiteboard/'),  // 白板图片，如 "whiteboard/abc.png"
          image.fileName  // 只用文件名
        ];
        
        const isReferenced = pathVariants.some(variant => referencedImages.has(variant));
        
        // 如果图片被引用，跳过
        if (isReferenced) {
          skippedByReference++;
          if (processedCount <= 5) {
            console.log(`[图片清理] 跳过被引用的图片: ${relativePath}`);
          }
          continue;
        }
        
        // 检查文件修改时间
        const mtime = new Date(image.mtime).getTime();
        const fileAge = now - mtime;
        const fileAgeDays = Math.floor(fileAge / 86400000);
        
        if (fileAge <= retentionMs) {
          skippedByAge++;
          if (processedCount <= 5) {
            console.log(`[图片清理] 跳过新图片 (${fileAgeDays}天 < ${retentionDays}天): ${relativePath}`);
          }
          continue;
        }
        
        // 图片未被引用且超过保留期
        orphanedImages.push(image);
        console.log(`[图片清理] ✓ 孤立图片: ${relativePath}, 年龄: ${fileAgeDays} 天`);
      }
      
      console.log(`[图片清理] 统计: 总计=${localImages.length}, 被引用=${skippedByReference}, 太新=${skippedByAge}, 孤立=${orphanedImages.length}`);
      
      console.log(`[图片清理] 处理完成，发现 ${orphanedImages.length} 个未引用的旧图片`);
      
      // 4. 删除未引用的图片（本地 + 云端）
      if (orphanedImages.length > 0) {
        let deletedCount = 0;
        let totalSize = 0;
        let cloudDeletedCount = 0;
        
        for (const image of orphanedImages) {
          try {
            // 删除本地文件
            await fsPromises.unlink(image.path);
            deletedCount++;
            totalSize += image.size;
            console.log(`[图片清理] 已删除本地: ${image.relativePath}`);
            
            // 尝试删除云端文件（不阻塞清理流程）
            try {
              const cloudPath = image.relativePath.startsWith('whiteboard/') 
                ? `/FlashNote/images/${image.relativePath}`
                : `/FlashNote/images/${image.relativePath}`;
              
              await axios({
                method: 'DELETE',
                url: this.provider.baseUrl + cloudPath,
                auth: {
                  username: this.provider.username,
                  password: this.provider.password
                },
                timeout: 5000
              });
              
              cloudDeletedCount++;
              console.log(`[图片清理] 已删除云端: ${cloudPath}`);
            } catch (cloudError) {
              // 404 表示云端本来就不存在，忽略
              if (cloudError.response?.status === 404) {
                console.log(`[图片清理] 云端文件不存在: ${image.relativePath}`);
              } else {
                console.warn(`[图片清理] 删除云端失败 ${image.relativePath}:`, cloudError.message);
              }
            }
            
            // 每次操作后稍微延迟，避免频繁请求
            await delay(300);
            
          } catch (error) {
            console.error(`[图片清理] 删除本地失败 ${image.relativePath}:`, error.message);
          }
        }
        
        console.log(`[图片清理] 完成，删除本地 ${deletedCount} 个文件，云端 ${cloudDeletedCount} 个文件，释放 ${(totalSize / 1024 / 1024).toFixed(2)} MB 空间`);
        
        // 5. 更新云端元数据，移除已删除图片的记录
        if (cloudDeletedCount > 0) {
          try {
            console.log('[图片清理] 更新云端元数据...');
            const remainingImages = await this.scanLocalImages(true);
            await this.updateCloudImageMetadata(remainingImages);
            console.log('[图片清理] 云端元数据已更新');
          } catch (metadataError) {
            console.warn('[图片清理] 更新元数据失败:', metadataError.message);
          }
        }
        
        return { deletedCount, totalSize, orphanedImages, cloudDeletedCount };
      }
      
      console.log('[图片清理] 没有需要清理的图片');
      return { deletedCount: 0, totalSize: 0, orphanedImages: [] };
      
    } catch (error) {
      console.error('[图片清理] 清理失败:', error);
      throw error;
    }
  }
  
  /**
   * 扫描所有活跃笔记中引用的图片路径
   * @returns {Set<string>} 被引用的图片相对路径集合
   */
  async scanActiveNoteReferences() {
    const referencedImages = new Set();
    
    try {
      const { getInstance } = require('../dao/DatabaseManager');
      const db = getInstance().getDatabase();
      
      // 查询所有未删除的笔记和待办
      const notes = db.prepare('SELECT content FROM notes WHERE is_deleted = 0').all();
      const todos = db.prepare('SELECT content FROM todos WHERE is_deleted = 0').all();
      
      console.log(`[扫描引用] 找到 ${notes.length} 个活跃笔记`);
      console.log(`[扫描引用] 找到 ${todos.length} 个活跃待办`);
      
      // 正则匹配图片引用：![...](...) 和 <img src="...">
      const imageRegex = /!\[.*?\]\((.*?)\)|<img[^>]+src=["']([^"']+)["']/g;
      
      // 扫描笔记内容
      for (const note of notes) {
        if (!note.content) continue;
        
        let match;
        imageRegex.lastIndex = 0; // 重置正则索引
        while ((match = imageRegex.exec(note.content)) !== null) {
          const imagePath = match[1] || match[2];
          if (imagePath) {
            // 提取相对路径（去掉可能的协议前缀）
            const relativePath = this.extractRelativePath(imagePath);
            if (relativePath) {
              // 添加多种变体以提高匹配率
              referencedImages.add(relativePath);
              // 如果路径中包含 images/，也添加不带前缀的版本
              if (relativePath.includes('images/')) {
                referencedImages.add(relativePath.replace(/^images\//, ''));
              }
            }
          }
        }
      }
      
      // 扫描待办内容
      for (const todo of todos) {
        if (!todo.content) continue;
        
        let match;
        imageRegex.lastIndex = 0; // 重置正则索引
        while ((match = imageRegex.exec(todo.content)) !== null) {
          const imagePath = match[1] || match[2];
          if (imagePath) {
            const relativePath = this.extractRelativePath(imagePath);
            if (relativePath) {
              referencedImages.add(relativePath);
              if (relativePath.includes('images/')) {
                referencedImages.add(relativePath.replace(/^images\//, ''));
              }
            }
          }
        }
      }
      
      // 注意：白板图片也需要在笔记中实际引用才算被引用，不再自动标记所有白板图片为引用
      
      console.log(`[扫描引用] 扫描完成，找到 ${referencedImages.size} 个引用路径变体`);
      if (referencedImages.size > 0) {
        console.log(`[扫描引用] 引用示例:`, Array.from(referencedImages).slice(0, 10));
      }
      return referencedImages;
      
    } catch (error) {
      console.error('[图片清理] 扫描引用失败:', error);
      return referencedImages;
    }
  }
  
  /**
   * 从图片 URL 提取相对路径
   * @param {string} imagePath - 图片路径（可能包含协议、主机等）
   * @returns {string|null} 相对路径，如 "abc.png" 或 "whiteboard/xyz.png"
   */
  extractRelativePath(imagePath) {
    try {
      // 去掉可能的 file:// 或 http:// 协议
      let cleanPath = imagePath.replace(/^(file|https?):\/\//, '');
      
      // 如果是完整路径，提取文件名部分
      if (cleanPath.includes('images/')) {
        const parts = cleanPath.split('images/');
        if (parts.length > 1) {
          return parts[parts.length - 1]; // 取最后一段
        }
      }
      
      // 如果包含 whiteboard/ 路径
      if (cleanPath.includes('whiteboard/')) {
        const parts = cleanPath.split('whiteboard/');
        if (parts.length > 1) {
          return 'whiteboard/' + parts[parts.length - 1];
        }
      }
      
      // 如果只是文件名
      const fileName = path.basename(cleanPath);
      if (this.isImageFile(fileName)) {
        return fileName;
      }
      
      return null;
      
    } catch (error) {
      console.error('[图片清理] 路径解析失败:', imagePath, error);
      return null;
    }
  }

  /**
   * 更新云端图片元数据
   */
  async updateCloudImageMetadata(localImages) {
    const metadata = {};
    
    for (const image of localImages) {
      metadata[image.relativePath] = {
        hash: image.hash,
        size: image.size,
        mtime: image.mtime
      };
    }
    
    try {
      await axios({
        method: 'PUT',
        url: this.provider.baseUrl + this.imageMetadataFile,
        auth: {
          username: this.provider.username,
          password: this.provider.password
        },
        data: JSON.stringify(metadata, null, 2),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[图片同步] 元数据已更新');
    } catch (error) {
      console.error('更新云端图片元数据失败:', error);
    }
  }

  /**
   * 判断是否为图片文件
   */
  isImageFile(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext);
  }

  /**
   * 获取 MIME 类型
   */
  getMimeType(ext) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * 清理云端孤立图片（本地不存在的）
   */
  async cleanupOrphanedImages(localImages) {
    const cloudMetadata = await this.getCloudImageMetadata();
    const localPaths = new Set(localImages.map(img => img.relativePath));
    
    const orphanedPaths = Object.keys(cloudMetadata).filter(
      cloudPath => !localPaths.has(cloudPath)
    );
    
    console.log(`[图片清理] 发现 ${orphanedPaths.length} 个孤立图片`);
    
    for (const orphanedPath of orphanedPaths) {
      try {
        await axios({
          method: 'DELETE',
          url: this.provider.baseUrl + `/${orphanedPath}`,
          auth: {
            username: this.provider.username,
            password: this.provider.password
          }
        });
        console.log(`[图片清理] 已删除: ${orphanedPath}`);
      } catch (error) {
        console.warn(`[图片清理] 删除失败 (${orphanedPath}):`, error.message);
      }
    }
  }
}

module.exports = NutCloudImageSync;