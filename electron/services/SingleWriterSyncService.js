const crypto = require('crypto');
const axios = require('axios');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const NutCloudImageSync = require('./NutCloudImageSync');
const DatabaseManager = require('../dao/DatabaseManager');

// ==================== 状态机 ====================
const SyncState = {
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  UPLOADING: 'uploading',
  CONFLICT: 'conflict',
  ERROR: 'error'
};

// ==================== 核心类 ====================
class SingleWriterSyncService extends EventEmitter {
  constructor(db, deviceId) {
    super();
    this.db = db;
    this.deviceId = deviceId || require('../utils/DeviceIdManager').getInstance().getDeviceId();
    
    // WebDAV 配置
    this.baseUrl = 'https://dav.jianguoyun.com/dav';
    this.appFolder = '/FlashNote';
    this.notesFolder = '/FlashNote/notes';
    this.snapshotsFolder = '/FlashNote/snapshots';
    this.indexFolder = '/FlashNote/index';
    this.snapshotFolder = '/FlashNote/snapshot';
    this.username = null;
    this.password = null;
    
    // 增量同步配置
    this.MAX_DELTA = 200; // 超过此值触发全量恢复
    this.localRevisions = {}; // note_id -> rev
    this.lastSeenVersion = 0; // 最后见到的全局版本号
    
    // 图片同步服务
    this.imageSync = new NutCloudImageSync({
        baseUrl: this.baseUrl,
        get username() { return this._parent.username; },
        get password() { return this._parent.password; },
        get isAuthenticated() { return !!this._parent.username && !!this._parent.password; },
        _parent: this
    });
    
    // 初始化图片目录
    const userDataPath = app.getPath('userData');
    const localImagesDir = path.join(userDataPath, 'images');
    const localWhiteboardDir = path.join(localImagesDir, 'whiteboard');
    this.imageSync.initialize(localImagesDir, localWhiteboardDir);

    // 状态
    this.state = SyncState.IDLE;
    this.conflictNotes = new Map(); // noteId -> conflict info
    
    // 同步统计（生产监控）
    this.syncStats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      conflicts: 0,
      lastSyncTime: null,
      lastError: null
    };
    
    // 同步日志
    this._initSyncLog();
    
    // 加载本地版本状态
    this._loadLocalRevisions();
    
    // 自动快照策略配置
    this.snapshotPolicy = {
        modificationCount: 0,
        lastSnapshotTime: 0,
        MODIFICATION_THRESHOLD: 100, // 100次修改触发
        TIME_THRESHOLD: 24 * 60 * 60 * 1000 // 24小时触发
    };
    this._loadSnapshotPolicy();
  }
  
  _loadSnapshotPolicy() {
    try {
        const userDataPath = app.getPath('userData');
        const policyFile = path.join(userDataPath, 'snapshot-policy.json');
        if (fs.existsSync(policyFile)) {
            const data = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
            this.snapshotPolicy = { ...this.snapshotPolicy, ...data };
        }
    } catch (error) {
        console.error('加载快照策略失败:', error);
    }
  }

  _saveSnapshotPolicy() {
    try {
        const userDataPath = app.getPath('userData');
        const policyFile = path.join(userDataPath, 'snapshot-policy.json');
        fs.writeFileSync(policyFile, JSON.stringify(this.snapshotPolicy, null, 2));
    } catch (error) {
        console.error('保存快照策略失败:', error);
    }
  }
  
  _loadLocalRevisions() {
    try {
      const userDataPath = app.getPath('userData');
      const revFile = path.join(userDataPath, 'sync-revisions.json');
      if (fs.existsSync(revFile)) {
        const data = JSON.parse(fs.readFileSync(revFile, 'utf8'));
        this.localRevisions = data.revisions || {};
        this.lastSeenVersion = data.lastSeenVersion || 0;
        this._log('info', '加载本地版本状态', { 
          noteCount: Object.keys(this.localRevisions).length,
          lastSeenVersion: this.lastSeenVersion 
        });
      }
    } catch (error) {
      console.error('加载本地版本状态失败:', error);
      this.localRevisions = {};
      this.lastSeenVersion = 0;
    }
  }
  
  _saveLocalRevisions() {
    try {
      const userDataPath = app.getPath('userData');
      const revFile = path.join(userDataPath, 'sync-revisions.json');
      const data = {
        revisions: this.localRevisions,
        lastSeenVersion: this.lastSeenVersion,
        updatedAt: Date.now()
      };
      fs.writeFileSync(revFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('保存本地版本状态失败:', error);
    }
  }
  
  _initSyncLog() {
    try {
      const userDataPath = app.getPath('userData');
      const logDir = path.join(userDataPath, 'sync-logs');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      this.syncLogFile = path.join(logDir, `sync-${new Date().toISOString().split('T')[0]}.log`);
    } catch (error) {
      console.error('初始化同步日志失败:', error);
    }
  }
  
  _log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      deviceId: this.deviceId,
      message,
      ...data
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    if (this.syncLogFile) {
      try {
        fs.appendFileSync(this.syncLogFile, logLine);
      } catch (error) {
        console.error('写入同步日志失败:', error);
      }
    }
    
    // 同时输出到控制台
    const logFn = console[level] || console.log;
    logFn(`[SYNC ${level.toUpperCase()}]`, message, data);
  }

  // ==================== 核心：写入前校验 ====================
  async validateBeforeWrite(noteId, localContent) {
    this.state = SyncState.CHECKING;
    
    try {
      const localHash = this._computeHash(localContent);
      const remoteMeta = await this._getRemoteMeta(noteId);
      
      if (!remoteMeta) {
        // 远程不存在，允许写入
        return { canWrite: true, reason: 'new_note' };
      }
      
      if (remoteMeta.hash === localHash) {
        // Hash 一致，允许写入
        return { canWrite: true, reason: 'hash_match' };
      }
      
      // Hash 不一致 → 冲突
      this.state = SyncState.CONFLICT;
      this.conflictNotes.set(noteId, {
        localHash,
        remoteHash: remoteMeta.hash,
        remoteDevice: remoteMeta.last_modified_by,
        remoteTime: remoteMeta.last_modified_at
      });
      
      return { 
        canWrite: false, 
        reason: 'hash_mismatch',
        conflict: this.conflictNotes.get(noteId)
      };
      
    } finally {
      if (this.state === SyncState.CHECKING) {
        this.state = SyncState.IDLE;
      }
    }
  }

  // ==================== 核心：原子写入 ====================
  async writeNote(noteId, content) {
    if (!this.username || !this.password) {
      throw new Error('未认证，请先调用 authenticate');
    }
    
    // 确保使用sync_id（如果存在）
    const localNote = this._getLocalNote(noteId);
    const actualNoteId = localNote?.sync_id || noteId;
    
    this._log('info', '开始写入笔记', { noteId: actualNoteId, contentLength: content.length });
    
    const validation = await this.validateBeforeWrite(actualNoteId, content);
    
    if (!validation.canWrite) {
      this._log('warn', '写入被拒绝', { noteId: actualNoteId, reason: validation.reason });
      this.syncStats.conflicts++;
      throw new Error(`Write forbidden: ${validation.reason}`);
    }
    
    this.state = SyncState.UPLOADING;
    
    try {
      const noteHash = this._computeHash(content);
      const timestamp = Date.now();
      
      // 1. 备份旧版本（如果存在）
      await this._backupOldVersion(actualNoteId);
      
      // 2. 写入临时文件
      const tmpPath = `${this.notesFolder}/note-${actualNoteId}.tmp`;
      await this._putFile(tmpPath, content);
      
      // 3. 原子 MOVE
      const notePath = `${this.notesFolder}/note-${actualNoteId}.md`;
      await this._moveFile(tmpPath, notePath);
      
      // 4. 更新 meta
      const meta = {
        note_id: actualNoteId,
        hash: noteHash,
        last_modified_by: this.deviceId,
        last_modified_at: timestamp
      };
      await this._putMeta(actualNoteId, meta);
      
      // 5. 更新变更日志（异步，不阻塞）
      this._updateChangelog(actualNoteId, noteHash).catch(err => {
        console.warn('更新日志失败（不影响保存）:', err);
      });
      
      // 6. 更新本地记录
      this._updateLocalHash(actualNoteId, noteHash);
      
      this.syncStats.successfulSyncs++;
      this.syncStats.lastSyncTime = Date.now();
      this._log('info', '笔记写入成功', { noteId: actualNoteId, hash: noteHash });
      
      this.emit('note:uploaded', { noteId: actualNoteId, hash: noteHash });
      return { success: true, hash: noteHash };
      
    } catch (error) {
      this.state = SyncState.ERROR;
      this.syncStats.failedSyncs++;
      this.syncStats.lastError = error.message;
      this._log('error', '笔记写入失败', { noteId: actualNoteId, error: error.message });
      throw error;
    } finally {
      this.syncStats.totalSyncs++;
      if (this.state === SyncState.UPLOADING) {
        this.state = SyncState.IDLE;
      }
    }
  }

  // ==================== 增量同步（核心优化）====================
  async incrementalSync(options = {}) {
    this._log('info', '开始增量同步');
    
    try {
      // 1. 获取变更日志
      const changelog = await this._getChangelog();
      
      // 2. 判断是否需要全量恢复
      if (!changelog || (changelog.version - this.lastSeenVersion) > this.MAX_DELTA) {
        this._log('warn', '触发全量恢复', {
          reason: !changelog ? '日志不存在' : '版本差距过大',
          delta: changelog ? (changelog.version - this.lastSeenVersion) : 'N/A'
        });
        return await this._fullRestore();
      }
      
      // 3. 增量同步
      const results = [];
      let successCount = 0;
      let errorCount = 0;
      
      // 筛选需要同步的笔记
      const toSync = [];
      for (const change of changelog.changes) {
        const localRev = this.localRevisions[change.note_id] || 0;
        if (change.rev > localRev) {
          toSync.push(change);
        }
      }
      
      this._log('info', '增量同步需处理笔记', { count: toSync.length });
      
      // 同步变更的笔记
      for (const change of toSync) {
        try {
          const result = await this._syncNote(change.note_id);
          if (result.success) {
            this.localRevisions[change.note_id] = change.rev;
            successCount++;
          } else {
            // 即使失败（如笔记不存在），也更新 rev，避免无限重试
            // 但保留错误计数
            this.localRevisions[change.note_id] = change.rev;
            errorCount++;
            this._log('warn', '笔记同步失败但已标记为已处理', { 
              noteId: change.note_id, 
              error: result.error 
            });
          }
          results.push({ noteId: change.note_id, ...result });
        } catch (error) {
          this._log('error', '同步笔记异常', { noteId: change.note_id, error: error.message });
          // 异常情况也标记为已处理
          this.localRevisions[change.note_id] = change.rev;
          errorCount++;
          results.push({ noteId: change.note_id, success: false, error: error.message });
        }
      }
      
      // 更新本地版本号
      this.lastSeenVersion = changelog.version;
      this._saveLocalRevisions();
      
      return {
        success: true,
        mode: 'incremental',
        results,
        summary: {
          total: toSync.length,
          success: successCount,
          errors: errorCount
        }
      };
      
    } catch (error) {
      this._log('error', '增量同步失败', { error: error.message });
      throw error;
    }
  }
  
  // ==================== 全量恢复（Bundle）====================
  async _fullRestore() {
    this._log('info', '开始全量恢复');
    
    try {
      // 1. 下载 Bundle
      const bundlePath = `${this.snapshotFolder}/notes-snapshot.bundle`;
      const bundleContent = await this._getFile(bundlePath);
      
      if (!bundleContent) {
        this._log('warn', 'Bundle 不存在，回退到传统同步');
        return await this._legacyFullSync();
      }
      
      const bundle = JSON.parse(bundleContent);
      // 兼容 version 字段
      const bundleVersion = bundle.version || bundle.snapshot_version;
      
      this._log('info', 'Bundle 加载成功', { 
        version: bundleVersion,
        noteCount: Object.keys(bundle.notes || {}).length 
      });
      
      // 2. 找出需要恢复的笔记
      const notesToDownload = [];
      const results = [];
      let successCount = 0;
      let errorCount = 0;
      
      for (const [noteId, noteData] of Object.entries(bundle.notes || {})) {
        const localHash = this._getLocalHash(noteId);
        // generateSnapshot 生成的结构是扁平的，hash 直接在 noteData 上
        const remoteHash = noteData.hash; 
        
        if (localHash !== remoteHash) {
            notesToDownload.push({ noteId, hash: remoteHash });
        }
      }
      
      this._log('info', `需要恢复 ${notesToDownload.length} 个笔记`);
      
      // 3. 批量下载（控制并发）
      const BATCH_SIZE = 5;
      for (let i = 0; i < notesToDownload.length; i += BATCH_SIZE) {
        const batch = notesToDownload.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async ({ noteId, hash }) => {
            try {
                // 下载笔记内容
                const notePath = `${this.notesFolder}/note-${noteId}.md`;
                const content = await this._safeGetFile(notePath);
                
                if (content) {
                    this._saveLocalNote(noteId, content, hash);
                    successCount++;
                    results.push({ noteId, success: true, action: 'restored' });
                } else {
                    throw new Error('Remote content not found');
                }
            } catch (error) {
                this._log('error', '恢复笔记失败', { noteId, error: error.message });
                errorCount++;
                results.push({ noteId, success: false, error: error.message });
            }
        }));
        
        // 简单的延迟，避免请求过快
        if (i + BATCH_SIZE < notesToDownload.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // 4. 检查本地是否有新增/修改的笔记需要上传
      const db = DatabaseManager.getInstance().getDatabase();
      const localNotes = db.prepare('SELECT sync_id, id, content FROM notes WHERE deleted_at IS NULL').all();
      const bundleNoteIds = new Set(Object.keys(bundle.notes || {}));
      
      this._log('info', '检查本地新增/修改的笔记');
      
      for (const note of localNotes) {
        const noteId = note.sync_id || note.id;
        const content = note.content || '';
        const localHash = this._computeHash(content);
        
        // 本地新增（Bundle 中不存在）
        if (!bundleNoteIds.has(noteId)) {
          this._log('info', '检测到本地新笔记，准备上传', { noteId });
          try {
            const uploadResult = await this._uploadNote(noteId, content);
            // 更新 changelog
            await this._updateChangelog(noteId, uploadResult.hash);
            successCount++;
            results.push({ noteId, success: true, action: 'uploaded_new' });
          } catch (error) {
            this._log('error', '上传新笔记失败', { noteId, error: error.message });
            errorCount++;
            results.push({ noteId, success: false, error: error.message });
          }
          continue;
        }
        
        // 本地修改（Hash 不一致）
        const bundleHash = bundle.notes[noteId]?.hash;
        if (bundleHash && localHash !== bundleHash) {
          this._log('info', '检测到本地修改，准备上传', { noteId });
          try {
            const uploadResult = await this._uploadNote(noteId, content);
            // 更新 changelog
            await this._updateChangelog(noteId, uploadResult.hash);
            successCount++;
            results.push({ noteId, success: true, action: 'uploaded_modified' });
          } catch (error) {
            this._log('error', '上传修改失败', { noteId, error: error.message });
            errorCount++;
            results.push({ noteId, success: false, error: error.message });
          }
        }
      }
      
      // 5. 初始化版本状态
      const newLocalRevisions = {};
      for (const [noteId, noteData] of Object.entries(bundle.notes || {})) {
          newLocalRevisions[noteId] = noteData.rev || 1;
      }
      
      this.localRevisions = newLocalRevisions;
      this.lastSeenVersion = bundleVersion || 0;
      this._saveLocalRevisions();
      
      return {
        success: true,
        mode: 'full_restore',
        results,
        summary: {
          total: Object.keys(bundle.notes || {}).length + localNotes.length,
          success: successCount,
          errors: errorCount
        }
      };
      
    } catch (error) {
      this._log('error', '全量恢复失败', { error: error.message });
      // 回退到传统方式
      return await this._legacyFullSync();
    }
  }
  
  // ==================== 传统全量同步（兜底）====================
  async _legacyFullSync() {
    this._log('info', '使用传统全量同步（双向）');
    
    try {
      // 1. 获取远程列表
      const remoteNoteIds = await this.listRemoteNotes();
      const remoteSet = new Set(remoteNoteIds);
      
      // 2. 获取本地列表
      const db = DatabaseManager.getInstance().getDatabase();
      const localNotes = db.prepare('SELECT sync_id, id FROM notes WHERE deleted_at IS NULL').all();
      const localSet = new Set(localNotes.map(n => n.sync_id || n.id));
      
      // 3. 合并列表
      const allNoteIds = new Set([...remoteSet, ...localSet]);
      
      this._log('info', `全量同步扫描: 远程 ${remoteSet.size}, 本地 ${localSet.size}, 总计 ${allNoteIds.size}`);
      
      const results = [];
      let successCount = 0;
      let errorCount = 0;
      
      // 4. 逐个智能同步
      for (const noteId of allNoteIds) {
        try {
          // 使用 syncFromRemote 进行双向智能同步
          const result = await this.syncFromRemote(noteId);
          
          // 如果上传成功，顺便更新 changelog (为了下次能用增量)
          if (result.action === 'uploaded' || result.action === 'forced_upload') {
             this._updateChangelog(noteId, result.hash).catch(() => {});
          }
          
          successCount++;
          results.push({ noteId, success: true, ...result });
        } catch (error) {
          errorCount++;
          results.push({ noteId, success: false, error: error.message });
        }
      }
      
      return {
        success: true,
        mode: 'legacy_full',
        results,
        summary: {
          total: allNoteIds.size,
          success: successCount,
          errors: errorCount
        }
      };
      
    } catch (error) {
      this._log('error', '传统全量同步失败', { error: error.message });
      throw error;
    }
  }
  
  // ==================== 同步单个笔记 ====================
  async _syncNote(noteId) {
    try {
      const notePath = `${this.notesFolder}/note-${noteId}.md`;
      const metaPath = `${this.notesFolder}/note-${noteId}.meta.json`;
      
      const [meta, content] = await Promise.all([
        this._getFile(metaPath).then(c => c ? JSON.parse(c) : null),
        this._getFile(notePath)
      ]);
      
      // 检查 meta 和 content 的完整性
      if (!meta && !content) {
        // 两者都不存在：笔记已被删除
        return { success: false, error: 'Note not found' };
      }
      
      if (meta && !content) {
        // Meta 存在但内容缺失：异常状态，需要修复
        this._log('warn', '检测到损坏的笔记（meta存在但内容缺失），尝试修复', { noteId });
        
        // 检查本地是否有该笔记
        const localNote = this._getLocalNote(noteId);
        if (localNote && localNote.content) {
          // 本地有内容，重新上传
          try {
            await this._deleteFile(metaPath); // 清理残留 meta
            const result = await this._uploadNote(noteId, localNote.content);
            this._log('info', '已修复并重新上传', { noteId, hash: result.hash });
            return { success: true, action: 'repaired_and_uploaded', hash: result.hash };
          } catch (uploadError) {
            this._log('error', '修复失败', { noteId, error: uploadError.message });
            return { success: false, error: `Repair failed: ${uploadError.message}` };
          }
        } else {
          // 本地也没有，删除残留 meta
          try {
            await this._deleteFile(metaPath);
            this._log('info', '已删除损坏的 meta 文件', { noteId });
            return { success: false, error: 'Corrupted note cleaned up' };
          } catch (deleteError) {
            return { success: false, error: 'Failed to clean up corrupted note' };
          }
        }
      }
      
      if (!meta && content) {
        // Content 存在但 meta 缺失：重新生成 meta
        this._log('warn', '检测到缺失的 meta 文件，重新生成', { noteId });
        const hash = this._computeHash(content);
        const meta = {
          note_id: noteId,
          hash: hash,
          last_modified_by: this.deviceId,
          last_modified_at: Date.now()
        };
        await this._putMeta(noteId, meta);
        this._saveLocalNote(noteId, content, hash);
        return { success: true, action: 'repaired_meta', hash };
      }
      
      // 正常情况：meta 和 content 都存在
      this._saveLocalNote(noteId, content, meta.hash);
      
      return { success: true, action: 'downloaded', hash: meta.hash };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // ==================== 获取变更日志 ====================
  async _getChangelog() {
    try {
      const changelogPath = `${this.indexFolder}/notes-changelog.json`;
      const content = await this._getFile(changelogPath);
      if (!content) return null;
      return JSON.parse(content);
    } catch (error) {
      this._log('warn', '获取日志失败', { error: error.message });
      return null;
    }
  }
  
  // ==================== 更新变更日志（写入时调用）====================
  async _updateChangelog(noteId, hash) {
    try {
      // 确保 index 目录存在
      await this._ensureFolder(this.indexFolder);
      
      const changelogPath = `${this.indexFolder}/notes-changelog.json`;
      
      // 读取现有日志
      let changelog = await this._getChangelog() || {
        version: 0,
        changes: []
      };
      
      // 添加新变更
      const currentRev = this.localRevisions[noteId] || 0;
      const newRev = currentRev + 1;
      
      changelog.version += 1;
      changelog.changes.push({
        note_id: noteId,
        rev: newRev,
        hash: hash,
        ts: Date.now()
      });
      
      // 保留最近 MAX_DELTA 条
      if (changelog.changes.length > this.MAX_DELTA) {
        changelog.changes = changelog.changes.slice(-this.MAX_DELTA);
      }
      
      // 更新本地版本
      this.localRevisions[noteId] = newRev;
      this._saveLocalRevisions();
      
      // 写回云端
      await this._putFile(changelogPath, JSON.stringify(changelog));
      
      this._log('info', '更新日志成功', { noteId, rev: newRev, version: changelog.version });

      // 检查是否需要触发自动快照
      this._checkSnapshotPolicy();
      
    } catch (error) {
      // 日志更新失败不影响笔记保存
      this._log('warn', '更新日志失败（不影响数据）', { noteId, error: error.message });
    }
  }

  // ==================== 自动快照策略检查 ====================
  async _checkSnapshotPolicy() {
    try {
        this.snapshotPolicy.modificationCount++;
        this._saveSnapshotPolicy();

        const now = Date.now();
        const timeSinceLastSnapshot = now - (this.snapshotPolicy.lastSnapshotTime || 0);
        
        // 触发条件 1: 修改次数阈值
        const countTrigger = this.snapshotPolicy.modificationCount >= this.snapshotPolicy.MODIFICATION_THRESHOLD;
        
        // 触发条件 2: 时间阈值 (且有修改)
        const timeTrigger = timeSinceLastSnapshot >= this.snapshotPolicy.TIME_THRESHOLD && this.snapshotPolicy.modificationCount > 0;

        if (countTrigger || timeTrigger) {
            // 检查红线条件
            if (this.state !== SyncState.IDLE) {
                this._log('info', '跳过自动快照：同步正在进行中');
                return;
            }

            // 异步执行，不阻塞当前流程
            this._log('info', '触发自动快照生成', { 
                reason: countTrigger ? 'modification_count' : 'time_threshold',
                count: this.snapshotPolicy.modificationCount,
                timeSince: timeSinceLastSnapshot
            });
            
            // 延迟一点执行，避免与当前写入冲突
            setTimeout(() => this.generateSnapshot(true), 5000);
        }
    } catch (error) {
        console.error('快照策略检查失败:', error);
    }
  }
  
  async _ensureFolder(folderPath) {
    try {
      await axios({
        method: 'MKCOL',
        url: this.baseUrl + folderPath,
        auth: { username: this.username, password: this.password }
      });
    } catch (error) {
      if (error.response?.status !== 405) { // 405 = 已存在
        throw error;
      }
    }
  }

  /**
   * 生成全量快照包（Bundle）
   * 用于新设备快速恢复或版本差距过大时的全量同步
   * @param {boolean} isAuto 是否为自动触发
   */
  async generateSnapshot(isAuto = false) {
    // 锁检查
    if (this.isGeneratingSnapshot) {
        this._log('warn', '快照生成跳过：已有任务在运行');
        return { success: false, error: 'Snapshot generation in progress' };
    }

    // 红线检查 (仅针对自动触发)
    if (isAuto) {
        // 1. 检查同步状态
        if (this.state !== SyncState.IDLE) {
            this._log('info', '快照生成跳过：同步正在进行');
            return { success: false, error: 'Sync in progress' };
        }
        // 2. 检查网络 (简单检查是否能连接)
        // 这里假设如果能走到这里，网络大概率是好的，或者在上传时会失败
    }

    this.isGeneratingSnapshot = true;

    try {
      this._log('info', `开始生成快照包 (${isAuto ? '自动' : '手动'})...`);
      
      // 1. 确保 snapshot 目录存在
      await this._ensureFolder(this.snapshotFolder);
      
      // 2. 获取所有本地笔记
      const db = DatabaseManager.getInstance().getDatabase();
      const notes = db.prepare('SELECT * FROM notes WHERE deleted_at IS NULL').all();
      
      this._log('info', `扫描到 ${notes.length} 条笔记`);
      
      // 3. 构建 Bundle 数据
      const bundle = {
        version: Date.now(), // 快照版本号
        created_at: new Date().toISOString(),
        device_id: this.deviceId,
        notes_count: notes.length,
        notes: {}
      };
      
      // 4. 对每个笔记计算 hash 和 rev
      for (const note of notes) {
        const noteId = note.sync_id || note.id;
        const content = note.content || '';
        const hash = this._computeHash(content);
        const rev = this.localRevisions[noteId] || 1;
        
        bundle.notes[noteId] = {
          note_id: noteId,
          hash: hash,
          rev: rev,
          title: note.title || '',
          created_at: new Date(note.created_at).toISOString(),
          updated_at: new Date(note.updated_at).toISOString()
        };
      }
      
      // 5. 上传到云端 (先传 .tmp 再 rename)
      const bundlePath = `${this.snapshotFolder}/notes-snapshot.bundle`;
      const tmpPath = `${bundlePath}.tmp`;
      const bundleContent = JSON.stringify(bundle, null, 2);
      
      // 上传 .tmp
      await axios.put(
        this.baseUrl + tmpPath,
        bundleContent,
        {
          auth: { username: this.username, password: this.password },
          headers: { 'Content-Type': 'application/json' }
        }
      );

      // Rename .tmp -> .bundle
      await axios({
        method: 'MOVE',
        url: this.baseUrl + tmpPath,
        auth: { username: this.username, password: this.password },
        headers: {
            'Destination': this.baseUrl + bundlePath,
            'Overwrite': 'T'
        }
      });
      
      // 6. 更新策略状态
      this.snapshotPolicy.modificationCount = 0;
      this.snapshotPolicy.lastSnapshotTime = Date.now();
      this._saveSnapshotPolicy();

      this._log('info', '快照包生成成功', {
        version: bundle.version,
        notes_count: bundle.notes_count,
        size: `${(bundleContent.length / 1024).toFixed(2)} KB`
      });
      
      return { success: true, version: bundle.version, notes_count: bundle.notes_count };
      
    } catch (error) {
      this._log('error', '快照包生成失败', { error: error.message });
      throw error;
    } finally {
        this.isGeneratingSnapshot = false;
    }
  }

  // ==================== 核心：智能同步（上传或下载）====================
  async syncFromRemote(noteId) {
    this.state = SyncState.CHECKING;
    
    try {
      // 1. 检查本地是否存在
      const localNote = this._getLocalNote(noteId);
      
      if (!localNote) {
        // 本地不存在，尝试从云端下载
        this.state = SyncState.DOWNLOADING;
        const [remoteContent, remoteMeta] = await Promise.all([
          this._getFile(`${this.notesFolder}/note-${noteId}.md`).catch(() => null),
          this._getRemoteMeta(noteId)
        ]);
        
        if (remoteContent && remoteMeta) {
          this._saveLocalNote(noteId, remoteContent, remoteMeta.hash);
          return { action: 'downloaded', hash: remoteMeta.hash };
        }
        
        return { action: 'not_found' };
      }
      
      // 使用 sync_id（如果存在）
      const actualNoteId = localNote.sync_id || noteId;
      
      // 2. 本地存在，检查云端是否存在
      let remoteMeta;
      try {
        remoteMeta = await this._getRemoteMeta(actualNoteId);
      } catch (error) {
        if (error.response?.status === 404) {
          // 云端不存在，直接上传（不需要验证）
          this.state = SyncState.UPLOADING;
          const content = localNote.content || localNote.title || '';
          
          if (!content.trim()) {
            this._log('warn', '跳过空笔记', { noteId: actualNoteId });
            return { action: 'skipped_empty' };
          }
          
          try {
            const result = await this._uploadNote(actualNoteId, content);
            return { action: 'uploaded', hash: result.hash };
          } catch (uploadError) {
            this._log('error', '上传笔记失败', { noteId: actualNoteId, error: uploadError.message });
            throw uploadError;
          }
        }
        this._log('error', '获取远程元数据失败', { noteId: actualNoteId, error: error.message });
        throw error;
      }
      
      // 3. 云端存在，对比 hash
      const localHash = this._computeHash(localNote.content || '');
      
      if (localHash === remoteMeta.hash) {
        // 一致，无需操作
        this._updateLocalHash(actualNoteId, localHash);
        return { action: 'up_to_date' };
      }
      
      // 4. Hash 不一致，检查本地是否有未同步修改
      const hasLocalChanges = this._hasUnsyncedChanges(actualNoteId);
      
      if (hasLocalChanges) {
        // 冲突：本地有修改且云端也变了
        this.state = SyncState.CONFLICT;
        this.conflictNotes.set(actualNoteId, {
          localHash,
          remoteHash: remoteMeta.hash,
          remoteDevice: remoteMeta.last_modified_by,
          remoteTime: remoteMeta.last_modified_at
        });
        
        this.emit('conflict:detected', { noteId: actualNoteId });
        return { 
          action: 'conflict', 
          conflict: this.conflictNotes.get(actualNoteId) 
        };
      }
      
      // 5. 本地无修改，下载云端版本
      this.state = SyncState.DOWNLOADING;
      const remoteContent = await this._getFile(`${this.notesFolder}/note-${actualNoteId}.md`);
      this._saveLocalNote(actualNoteId, remoteContent, remoteMeta.hash);
      return { action: 'downloaded', hash: remoteMeta.hash };
      
    } catch (error) {
      this.state = SyncState.ERROR;
      throw error;
    } finally {
      if (this.state !== SyncState.CONFLICT) {
        this.state = SyncState.IDLE;
      }
    }
  }

  // ==================== 删除同步 ====================
  async syncDeletedNote(noteId) {
    try {
      // 1. 检查远程是否存在
      const remoteMeta = await this._getRemoteMetaSafe(noteId);
      if (remoteMeta.exists) {
          // 2. 删除远程文件和元数据
          await this._deleteFile(`${this.notesFolder}/note-${noteId}.md`);
          await this._deleteFile(`${this.notesFolder}/note-${noteId}.meta.json`);
          this._log('info', '同步删除：已删除远程笔记', { noteId });
          return { action: 'deleted_remote' };
      }
      return { action: 'already_deleted_remote' };
    } catch (error) {
      this._log('error', '同步删除失败', { noteId, error: error.message });
      throw error;
    }
  }

  _deleteLocalNote(noteId) {
    try {
      const stmt = this.db.prepare('UPDATE notes SET is_deleted = 1, deleted_at = ? WHERE id = ? OR sync_id = ?');
      stmt.run(Date.now(), noteId, noteId);
      this._log('info', '同步删除：已删除本地笔记', { noteId });
    } catch (error) {
      console.error(`删除本地笔记失败 (${noteId}):`, error);
    }
  }

  // ==================== 冲突处理 ====================
  async resolveConflict(noteId, resolution) {
    const conflict = this.conflictNotes.get(noteId);
    if (!conflict) {
      throw new Error('No conflict found for note: ' + noteId);
    }
    
    switch (resolution.action) {
      case 'use_remote':
        // 使用云端版本，覆盖本地
        await this.syncFromRemote(noteId);
        this.conflictNotes.delete(noteId);
        return { resolved: true, action: 'used_remote' };
        
      case 'keep_local_as_copy':
        // 保留本地为副本
        const localNote = this._getLocalNote(noteId);
        const copyId = `${noteId}-copy-${Date.now()}`;
        this._saveLocalNote(copyId, localNote.content, null);
        
        // 然后使用云端版本
        await this.syncFromRemote(noteId);
        this.conflictNotes.delete(noteId);
        return { resolved: true, action: 'saved_copy', copyId };
        
      case 'force_upload':
        // 强制上传本地版本（危险操作，需用户确认）
        const localNote2 = this._getLocalNote(noteId);
        // 跳过校验直接写
        await this._forceWrite(noteId, localNote2.content);
        this.conflictNotes.delete(noteId);
        return { resolved: true, action: 'forced_upload' };
        
      default:
        throw new Error('Unknown resolution action: ' + resolution.action);
    }
  }

  // ==================== WebDAV 操作 ====================
  async _getRemoteMeta(noteId) {
    try {
      const metaPath = `${this.notesFolder}/note-${noteId}.meta.json`;
      const content = await this._getFile(metaPath);
      return content ? JSON.parse(content) : null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async _putMeta(noteId, meta) {
    const metaPath = `${this.notesFolder}/note-${noteId}.meta.json`;
    await this._putFile(metaPath, JSON.stringify(meta, null, 2));
  }

  async _getFile(remotePath, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.get(this.baseUrl + remotePath, {
          auth: { username: this.username, password: this.password },
          responseType: 'text',
          timeout: 30000
        });
        return response.data;
      } catch (error) {
        const isLastRetry = i === retries - 1;
        const isNetworkError = !error.response || error.code === 'ECONNABORTED';
        
        if (isLastRetry || (error.response?.status === 404)) {
          if (error.response?.status !== 404) {
            console.error(`GET failed after ${i + 1} attempts:`, remotePath, error.message);
          }
          throw error;
        }
        
        if (isNetworkError) {
          console.warn(`GET retry ${i + 1}/${retries}:`, remotePath);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 指数退避
        } else {
          throw error;
        }
      }
    }
  }

  async _putFile(remotePath, content, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        await axios.put(this.baseUrl + remotePath, content, {
          auth: { username: this.username, password: this.password },
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          timeout: 30000
        });
        return; // 成功
      } catch (error) {
        const isLastRetry = i === retries - 1;
        const isNetworkError = !error.response || error.code === 'ECONNABORTED';
        
        if (isLastRetry) {
          console.error(`PUT failed after ${i + 1} attempts:`, remotePath, error.message);
          throw error;
        }
        
        if (isNetworkError) {
          console.warn(`PUT retry ${i + 1}/${retries}:`, remotePath);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 指数退避
        } else {
          throw error;
        }
      }
    }
  }

  async _moveFile(srcPath, destPath) {
    await axios({
      method: 'MOVE',
      url: this.baseUrl + srcPath,
      headers: {
        'Destination': this.baseUrl + destPath,
        'Overwrite': 'T'
      },
      auth: { username: this.username, password: this.password }
    });
  }

  async _deleteFile(remotePath) {
    try {
      await axios.delete(this.baseUrl + remotePath, {
        auth: { username: this.username, password: this.password }
      });
    } catch (error) {
      if (error.response?.status !== 404) {
        throw error;
      }
    }
  }

  async _backupOldVersion(noteId) {
    try {
      // 云端备份
      const oldContent = await this._getFile(`${this.notesFolder}/note-${noteId}.md`, 1); // 只重试1次
      const timestamp = Date.now();
      const backupPath = `${this.snapshotsFolder}/note-${noteId}-${timestamp}.bak`;
      await this._putFile(backupPath, oldContent, 1); // 只重试1次
      
      // 本地备份（防止云端失败）
      this._backupLocalVersion(noteId, oldContent, timestamp);
    } catch (error) {
      // 旧版本不存在，只做本地备份
      if (error.response?.status === 404) {
        const localNote = this._getLocalNote(noteId);
        if (localNote?.content) {
          this._backupLocalVersion(noteId, localNote.content, Date.now());
        }
      } else {
        console.warn('云端备份失败，已保存本地备份:', error.message);
      }
    }
  }
  
  _backupLocalVersion(noteId, content, timestamp) {
    try {
      const userDataPath = app.getPath('userData');
      const backupDir = path.join(userDataPath, 'sync-backups');
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const backupFile = path.join(backupDir, `note-${noteId}-${timestamp}.bak`);
      fs.writeFileSync(backupFile, content, 'utf8');
      
      // 清理旧备份（保留最近10个）
      this._cleanupOldBackups(noteId, backupDir);
    } catch (error) {
      console.error('本地备份失败:', error);
    }
  }
  
  _cleanupOldBackups(noteId, backupDir) {
    try {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith(`note-${noteId}-`) && f.endsWith('.bak'))
        .sort()
        .reverse();
      
      // 保留最近10个，删除其余
      files.slice(10).forEach(file => {
        fs.unlinkSync(path.join(backupDir, file));
      });
    } catch (error) {
      console.error('清理旧备份失败:', error);
    }
  }

  async _uploadNote(noteId, content) {
    // 直接上传（用于首次同步，不需要验证）
    const noteHash = this._computeHash(content);
    const timestamp = Date.now();
    
    try {
      // 1. 写入临时文件
      const tmpPath = `${this.notesFolder}/note-${noteId}.tmp`;
      await this._putFile(tmpPath, content);
      
      // 2. 原子 MOVE
      const notePath = `${this.notesFolder}/note-${noteId}.md`;
      await this._moveFile(tmpPath, notePath);
      
      // 3. 更新 meta
      const meta = {
        note_id: noteId,
        hash: noteHash,
        last_modified_by: this.deviceId,
        last_modified_at: timestamp
      };
      await this._putMeta(noteId, meta);
      
      // 4. 更新本地记录
      this._updateLocalHash(noteId, noteHash);
      
      this.syncStats.successfulSyncs++;
      this._log('info', '笔记上传成功', { noteId, hash: noteHash });
      
      return { success: true, hash: noteHash };
    } catch (error) {
      this.syncStats.failedSyncs++;
      this._log('error', '笔记上传失败', { noteId, error: error.message });
      throw error;
    }
  }

  async _forceWrite(noteId, content) {
    // 危险操作：跳过校验直接写
    const noteHash = this._computeHash(content);
    const timestamp = Date.now();
    
    await this._backupOldVersion(noteId);
    await this._putFile(`${this.notesFolder}/note-${noteId}.md`, content);
    await this._putMeta(noteId, {
      note_id: noteId,
      hash: noteHash,
      last_modified_by: this.deviceId,
      last_modified_at: timestamp
    });
    
    this._updateLocalHash(noteId, noteHash);
  }

  // ==================== 全局数据同步 (Todos, Settings, Plugins) ====================
  
  async syncAllData(options = {}) {
    await this._ensureDataFolder();
    
    const results = {
      todos: await this.syncTodos(),
      settings: await this.syncSettings(),
      plugins: await this.syncPluginState()
    };

    // 图片同步（可选跳过，用于自动同步场景）
    if (this.imageSync && !options.skipImages) {
        try {
            console.log('[Sync] Starting image sync...');
            results.images = await this.imageSync.syncImages();
            console.log('[Sync] Image sync completed:', results.images);
        } catch (error) {
            console.error('[Sync] Image sync failed:', error);
            results.images = { error: error.message };
        }
    } else if (options.skipImages) {
        console.log('[Sync] Image sync skipped (auto-sync mode)');
        results.images = { skipped: true };
    }
    
    return results;
  }

  async _ensureDataFolder() {
    this.dataFolder = '/FlashNote/data';
    try {
      await this._getFile(this.dataFolder);
    } catch (error) {
      if (error.response?.status === 404) {
        await this._mkcol(this.dataFolder);
      }
    }
  }

  async _mkcol(remotePath) {
    try {
      await axios({
        method: 'MKCOL',
        url: this.baseUrl + remotePath,
        auth: { username: this.username, password: this.password }
      });
    } catch (error) {
      if (error.response?.status !== 405) { // 405 means already exists
        throw error;
      }
    }
  }

  async syncTodos() {
    try {
      // 1. 获取本地数据
      const localTodos = this.db.prepare('SELECT * FROM todos').all();
      const localMap = new Map(); // sync_id -> localTodo
      localTodos.forEach(t => {
          if (t.sync_id) localMap.set(t.sync_id, t);
      });
      
      // 2. 获取远程数据
      let remoteTodos = [];
      try {
        const content = await this._getFile(`${this.dataFolder}/todos.json`);
        remoteTodos = JSON.parse(content);
      } catch (e) {
        if (e.response?.status !== 404) throw e;
      }

      // 3. 合并逻辑
      const mergedMap = new Map(); // sync_id -> todo
      
      // 处理远程数据
      remoteTodos.forEach(remote => {
        const syncId = remote.sync_id;
        if (!syncId) return; // Skip invalid remote todos

        // 查找本地匹配
        const local = localMap.get(syncId);
        
        if (local) {
            // 冲突解决：比较 updated_at
            const localTime = new Date(local.updated_at).getTime();
            const remoteTime = new Date(remote.updated_at).getTime();
            
            if (localTime >= remoteTime) {
                mergedMap.set(syncId, local);
            } else {
                // 使用远程数据，但保留本地 ID 以确保 UPDATE 而不是 INSERT
                const merged = { ...remote, id: local.id };
                mergedMap.set(syncId, merged);
            }
        } else {
            // 本地不存在，是新数据
            // 清除 ID，让数据库自动生成
            const { id, ...newTodo } = remote;
            mergedMap.set(syncId, newTodo);
        }
      });
      
      // 处理本地独有的数据 (尚未上传的)
      localTodos.forEach(local => {
          if (local.sync_id && !mergedMap.has(local.sync_id)) {
              mergedMap.set(local.sync_id, local);
          }
      });

      const mergedList = Array.from(mergedMap.values());
      
      // 写入本地 DB (使用事务)
      const transaction = this.db.transaction(() => {
        // 获取所有列名 (使用本地第一条数据作为模板，确保包含所有列)
        // 如果本地为空，尝试使用远程第一条，但要注意 id
        let sample = localTodos[0];
        if (!sample && mergedList.length > 0) {
            sample = mergedList[0];
        }
        
        if (!sample) return; // 没有任何数据

        const columns = Object.keys(sample).filter(k => k !== 'id'); // 排除 id，单独处理
        const placeholders = columns.map(c => `@${c}`);
        
        // 使用 INSERT OR REPLACE，但 ID 单独处理
        // 如果对象有 ID，则更新；如果没有，则插入
        // 但为了简单，我们可以使用 INSERT OR REPLACE INTO todos (id, ...)
        // 只要我们确保 mergedList 中的对象：
        // 1. 如果是更新，包含正确的本地 ID
        // 2. 如果是插入，ID 为 null/undefined
        
        const allColumns = ['id', ...columns];
        const allPlaceholders = ['@id', ...placeholders];

        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO todos (${allColumns.join(', ')})
          VALUES (${allPlaceholders.join(', ')})
        `);
        
        mergedList.forEach(todo => {
            try {
                // 确保新数据的 id 为 null (如果之前被删除了)
                if (!todo.hasOwnProperty('id')) {
                    todo.id = null;
                }
                stmt.run(todo);
            } catch (err) {
                console.error('Insert todo failed:', err, todo);
            }
        });
      });
      
      if (mergedList.length > 0) {
          transaction();
      }

      // 4. 上传回云端 (简单策略：总是上传合并后的完整列表)
      // 注意：上传前最好移除 id，或者保留也行（因为下载时我们会忽略它）
      // 为了保持一致性，我们上传完整对象
      if (JSON.stringify(mergedList) !== JSON.stringify(remoteTodos)) {
        await this._putFile(`${this.dataFolder}/todos.json`, JSON.stringify(mergedList));
      }

      return { success: true, count: mergedList.length };
    } catch (error) {
      console.error('Sync Todos Failed:', error);
      return { success: false, error: error.message };
    }
  }

  async syncSettings() {
    try {
      // 排除凭据等敏感信息
      const localSettings = this.db.prepare("SELECT * FROM settings WHERE key NOT IN ('webdav_username', 'webdav_password')").all();
      
      let remoteSettings = [];
      try {
        const content = await this._getFile(`${this.dataFolder}/settings.json`);
        remoteSettings = JSON.parse(content);
      } catch (e) {
        if (e.response?.status !== 404) throw e;
      }

      const mergedMap = new Map();
      remoteSettings.forEach(s => mergedMap.set(s.key, s));
      
      localSettings.forEach(local => {
        const remote = mergedMap.get(local.key);
        if (!remote || new Date(local.updated_at) > new Date(remote.updated_at)) {
          mergedMap.set(local.key, local);
        }
      });

      const mergedList = Array.from(mergedMap.values());
      
      const transaction = this.db.transaction(() => {
        const upsert = this.db.prepare(`
          INSERT OR REPLACE INTO settings (key, value, type, description, updated_at)
          VALUES (@key, @value, @type, @description, @updated_at)
        `);
        mergedList.forEach(s => upsert.run(s));
      });
      
      if (mergedList.length > 0) transaction();

      if (JSON.stringify(mergedList) !== JSON.stringify(remoteSettings)) {
        await this._putFile(`${this.dataFolder}/settings.json`, JSON.stringify(mergedList));
      }

      return { success: true, count: mergedList.length };
    } catch (error) {
      console.error('Sync Settings Failed:', error);
      return { success: false, error: error.message };
    }
  }

  async syncPluginState() {
    try {
      const userDataPath = app.getPath('userData');
      const pluginStatePath = path.join(userDataPath, 'plugins', 'plugins-state.json');
      
      let localState = {};
      if (fs.existsSync(pluginStatePath)) {
        localState = JSON.parse(fs.readFileSync(pluginStatePath, 'utf8'));
      }

      let remoteState = {};
      try {
        const content = await this._getFile(`${this.dataFolder}/plugins-state.json`);
        remoteState = JSON.parse(content);
      } catch (e) {
        if (e.response?.status !== 404) throw e;
      }

      // 合并：远程优先，因为通常是在新设备上同步
      // 但如果本地有修改，应该保留本地？
      // 简单策略：合并对象
      const mergedState = { ...remoteState, ...localState };
      
      // 如果本地是空的（新安装），完全使用远程
      if (Object.keys(localState).length === 0) {
          Object.assign(mergedState, remoteState);
      }

      // 写入本地
      const pluginsDir = path.dirname(pluginStatePath);
      if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
      fs.writeFileSync(pluginStatePath, JSON.stringify(mergedState, null, 2));

      // 上传回云端
      if (JSON.stringify(mergedState) !== JSON.stringify(remoteState)) {
        await this._putFile(`${this.dataFolder}/plugins-state.json`, JSON.stringify(mergedState));
      }

      return { success: true };
    } catch (error) {
      console.error('Sync Plugins Failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== 工具方法 ====================
  
  async listRemoteNotes() {
    try {
      // 使用 PROPFIND 获取文件列表
      const response = await axios({
        method: 'PROPFIND',
        url: this.baseUrl + this.notesFolder,
        auth: { username: this.username, password: this.password },
        headers: {
          'Depth': '1',
          'Content-Type': 'application/xml'
        }
      });

      // 简单的 XML 解析 (提取 href)
      // 响应格式通常是:
      // <D:response>
      //   <D:href>/dav/FlashNote/notes/note-123.md</D:href>
      //   ...
      // </D:response>
      
      const hrefs = response.data.match(/<D:href>(.*?)<\/D:href>/g) || [];
      const noteIds = new Set();
      
      hrefs.forEach(tag => {
        const href = tag.replace(/<\/?D:href>/g, '');
        // 匹配 note-{id}.md
        const match = href.match(/note-([a-zA-Z0-9-]+)\.md$/);
        if (match) {
          noteIds.add(match[1]);
        }
      });
      
      return Array.from(noteIds);
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }
      console.error('List remote notes failed:', error);
      throw error;
    }
  }

  _computeHash(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  _getLocalNote(noteId) {
    const stmt = this.db.prepare('SELECT * FROM notes WHERE id = ? OR sync_id = ?');
    return stmt.get(noteId, noteId);
  }

  _getLocalHash(noteId) {
    const stmt = this.db.prepare('SELECT sync_hash FROM notes WHERE id = ? OR sync_id = ?');
    const row = stmt.get(noteId, noteId);
    return row?.sync_hash || null;
  }

  _updateLocalHash(noteId, hash) {
    const stmt = this.db.prepare('UPDATE notes SET sync_hash = ?, synced_at = ? WHERE id = ? OR sync_id = ?');
    stmt.run(hash, Date.now(), noteId, noteId);
  }

  _saveLocalNote(noteId, content, hash) {
    try {
      // 使用事务确保数据完整性
      const saveTransaction = this.db.transaction(() => {
        // 检查是否存在
        const existing = this._getLocalNote(noteId);
        
        const timestamp = Date.now();
        
        if (existing) {
          // 更新现有笔记
          const stmt = this.db.prepare(`
            UPDATE notes 
            SET content = ?, sync_hash = ?, synced_at = ?, updated_at = ?
            WHERE id = ? OR sync_id = ?
          `);
          stmt.run(content, hash, timestamp, timestamp, noteId, noteId);
        } else {
          // 插入新笔记
          const stmt = this.db.prepare(`
            INSERT INTO notes (sync_id, title, content, sync_hash, synced_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          // 从内容提取标题（第一行）
          const title = content.split('\n')[0].replace(/^#+\s*/, '').trim() || '未命名笔记';
          stmt.run(noteId, title, content, hash, timestamp, timestamp, timestamp);
        }
      });
      
      saveTransaction();
    } catch (error) {
      console.error(`保存本地笔记失败 (${noteId}):`, error);
      throw new Error(`保存本地笔记失败: ${error.message}`);
    }
  }

  _hasUnsyncedChanges(noteId) {
    const note = this._getLocalNote(noteId);
    if (!note) return false;
    
    // 检查 updated_at 是否晚于 synced_at
    return note.updated_at > (note.synced_at || 0);
  }

  // ==================== 监控和诊断 ====================
  getSyncStats() {
    return {
      ...this.syncStats,
      currentState: this.state,
      conflictCount: this.conflictNotes.size,
      deviceId: this.deviceId
    };
  }
  
  async healthCheck() {
    const health = {
      authenticated: !!(this.username && this.password),
      canConnect: false,
      folderStructure: false,
      localDbOk: false,
      timestamp: Date.now()
    };
    
    try {
      // 检查数据库
      const noteCount = this.db.prepare('SELECT COUNT(*) as count FROM notes').get();
      health.localDbOk = noteCount !== undefined;
      health.noteCount = noteCount.count;
    } catch (error) {
      this._log('error', '数据库健康检查失败', { error: error.message });
    }
    
    if (health.authenticated) {
      try {
        // 检查连接
        await this.authenticate();
        health.canConnect = true;
        
        // 检查文件夹结构
        await this.ensureFolderStructure();
        health.folderStructure = true;
      } catch (error) {
        this._log('error', '云端健康检查失败', { error: error.message });
        health.error = error.message;
      }
    }
    
    return health;
  }

  // ==================== 认证 ====================
  setCredentials(username, password) {
    this.username = username;
    this.password = password;
  }

  _ensureAllNotesHaveSyncId() {
    try {
      const crypto = require('crypto');
      const notesWithoutSyncId = this.db.prepare("SELECT id FROM notes WHERE sync_id IS NULL OR sync_id = ''").all();
      
      if (notesWithoutSyncId.length > 0) {
        console.log(`为 ${notesWithoutSyncId.length} 个笔记生成 sync_id...`);
        const stmt = this.db.prepare('UPDATE notes SET sync_id = ? WHERE id = ?');
        
        for (const note of notesWithoutSyncId) {
          const syncId = crypto.randomUUID();
          stmt.run(syncId, note.id);
        }
        
        console.log('✅ sync_id 生成完成');
      }
    } catch (error) {
      console.error('❌ sync_id 生成失败:', error);
      // 不抛出错误，允许应用继续运行
    }
  }

  async authenticate() {
    try {
      // 使用 PROPFIND 检查根目录是否可访问
      const response = await axios({
        method: 'PROPFIND',
        url: this.baseUrl,
        auth: { username: this.username, password: this.password },
        headers: {
          'Depth': '0'
        }
      });
      
      // 认证成功后，确保所有笔记都有 sync_id
      this._ensureAllNotesHaveSyncId();
      
      return response.status === 207 || response.status === 200;
    } catch (error) {
      console.error('WebDAV auth error:', error.response?.status, error.message);
      throw new Error('WebDAV authentication failed: ' + (error.response?.statusText || error.message));
    }
  }

  async ensureFolderStructure() {
    const folders = [
      this.appFolder,
      this.notesFolder,
      this.snapshotsFolder
    ];
    
    for (const folder of folders) {
      await this._ensureFolder(folder);
    }
  }

  async _ensureFolder(remotePath) {
    try {
      // 先检查是否存在
      try {
        await axios({
          method: 'PROPFIND',
          url: this.baseUrl + remotePath,
          auth: { username: this.username, password: this.password },
          headers: { 'Depth': '0' }
        });
        // 已存在
        return;
      } catch (checkError) {
        if (checkError.response?.status !== 404) {
          throw checkError;
        }
        // 不存在，继续创建
      }
      
      // 创建文件夹
      await axios({
        method: 'MKCOL',
        url: this.baseUrl + remotePath,
        auth: { username: this.username, password: this.password }
      });
    } catch (error) {
      // 405 表示已存在，忽略
      if (error.response?.status !== 405) {
        console.error('Ensure folder failed:', remotePath, error.response?.status);
        throw error;
      }
    }
  }
}

module.exports = SingleWriterSyncService;
