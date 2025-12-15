const ChangeLogDAO = require('../dao/ChangeLogDAO');
const NoteDAO = require('../dao/NoteDAO');
const TodoDAO = require('../dao/TodoDAO');
const ConflictResolver = require('../utils/ConflictResolver');
const RetryHelper = require('../utils/RetryHelper');
const { getInstance: getDeviceIdManager } = require('../utils/DeviceIdManager');

/**
 * 增量同步服务
 * 基于变更日志实现高效的增量同步
 */
class IncrementalSyncService {
  constructor(cloudProvider) {
    this.provider = cloudProvider;
    this.changeLog = new ChangeLogDAO();
    this.noteDAO = new NoteDAO();
    this.todoDAO = new TodoDAO();
    
    // 配置
    this.batchSize = 50; // 每批处理的变更数量
    this.useFullSyncFallback = true; // 失败时回退到全量同步
    
    // 同步控制
    this.isStopping = false; // 是否正在停止同步
  }

  /**
   * 执行增量同步
   * @returns {object} 同步结果
   */
  async performIncrementalSync() {
    try {
      console.log('========================================');
      console.log('[增量同步] 开始增量同步...');
      console.log('========================================');

      // 检查是否需要全量同步（首次同步或本地数据为空）
      const needsFullSync = await this._checkNeedsFullSync();
      console.log(`[增量同步] needsFullSync 检查结果: ${needsFullSync}`);
      if (needsFullSync) {
        console.log('[增量同步] ★★★ 检测到需要全量同步（首次同步或本地数据为空）★★★');
        return {
          success: false,
          needsFullSync: true,
          reason: '首次同步或本地数据为空，需要全量同步'
        };
      }

      // 1. 推送本地变更到云端
      const pushResult = await this.pushLocalChanges();
      
      // 2. 拉取云端变更到本地
      const pullResult = await this.pullRemoteChanges();
      
      // 3. 清理已同步的旧变更记录
      await this.cleanupOldChanges();

      const result = {
        success: true,
        pushed: pushResult.count,
        pulled: pullResult.count,
        conflicts: pullResult.conflicts,
        timestamp: new Date().toISOString()
      };

      console.log('[增量同步] 增量同步完成:', result);
      return result;
    } catch (error) {
      console.error('[增量同步] 增量同步失败:', error);
      
      if (this.useFullSyncFallback) {
        console.log('[增量同步] 回退到全量同步...');
        throw error; // 让调用者处理回退
      }
      
      throw error;
    }
  }

  /**
   * 检查是否需要全量同步
   * 当本地数据为空或从未成功同步过时，需要先进行全量同步
   */
  async _checkNeedsFullSync() {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    
    // 检查是否有成功同步的标记文件
    const syncMarkerPath = path.join(app.getPath('userData'), 'sync-initialized.marker');
    console.log('[增量同步] 检查同步标记文件:', syncMarkerPath);
    
    if (!fs.existsSync(syncMarkerPath)) {
      console.log('[增量同步] ★ 未找到同步初始化标记，需要全量同步');
      return true;
    }
    
    console.log('[增量同步] 找到同步标记文件，继续检查本地数据...');
    
    // 检查本地是否有笔记或待办数据
    let localNotes = [];
    let localTodos = [];
    try {
      localNotes = this.noteDAO.findAll ? this.noteDAO.findAll() : [];
      localTodos = this.todoDAO.findAll ? this.todoDAO.findAll() : [];
      console.log('[增量同步] 本地数据统计: 笔记=', localNotes.length, '待办=', localTodos.length);
    } catch (error) {
      console.warn('[增量同步] 获取本地数据失败:', error);
      // 本地数据库错误，无法继续，抛出异常
      throw new Error(`无法访问本地数据库: ${error.message}`);
    }
    
    // 如果本地完全没有数据，可能是新设备，需要检查云端
    if (localNotes.length === 0 && localTodos.length === 0) {
      // 检查云端是否有数据（可能抛出网络错误，让它传播出去）
      const hasRemoteData = await this._checkRemoteHasData();
      if (hasRemoteData) {
        console.log('[增量同步] ★ 本地无数据但云端有数据，需要全量同步');
        return true;
      }
    }
    
    console.log('[增量同步] 不需要全量同步，继续增量同步');
    return false;
  }

  /**
   * 检查云端是否有数据（通过检查数据文件是否存在）
   */
  async _checkRemoteHasData() {
    try {
      if (this.provider && this.provider.exists) {
        return await this.provider.exists();
      }
    } catch (error) {
      // 404错误表示文件不存在，这是正常的
      if (error.response?.status === 404) {
        console.log('[增量同步] 云端数据文件不存在');
        return false;
      }
      // 其他错误（网络错误、认证错误等）应该抛出
      console.error('[增量同步] 检查云端数据失败:', error);
      throw error;
    }
    return false;
  }

  /**
   * 推送本地变更到云端
   */
  async pushLocalChanges() {
    let totalPushed = 0;
    let allChanges = [];
    let hasMore = true;
    let offset = 0;
    const errors = [];

    console.log('[增量同步] 开始推送本地变更...');

    // 使用流式处理，避免一次性加载所有变更到内存
    while (hasMore && !this.isStopping) {
      // 分批获取未同步的变更
      const changes = await this.changeLog.getUnsyncedChanges(this.batchSize);
      
      if (changes.length === 0) {
        console.log('[增量同步] 没有本地变更需要推送');
        hasMore = false;
        break;
      }

      console.log(`[增量同步] 处理第 ${offset + 1}-${offset + changes.length} 个变更...`);

      // 检查是否需要停止
      if (this.isStopping) {
        console.log('[增量同步] 收到停止信号，中断推送');
        break;
      }

      // 按实体类型分组 - 每个实体类型生成一个变更包文件
      const groupedChanges = this._groupChangesByEntity(changes);
      
      console.log(`[增量同步] 本批次将生成 ${Object.keys(groupedChanges).length} 个变更包文件`);
      
      // 上传变更
      let successfulChangeIds = [];
      try {
        const uploadResults = await RetryHelper.executeBatchWithRetry(
          Object.entries(groupedChanges),
          async ([entityType, entityChanges]) => {
            return await this._uploadEntityChanges(entityType, entityChanges);
          },
          {
            maxRetries: 3,
            batchSize: 5,
            continueOnError: true,
            onProgress: (current, total) => {
              console.log(`[增量同步] 上传批次进度: ${current}/${total}`);
            }
          }
        );

        // 修复：检查所有实体类型的上传是否都成功
        // uploadResults.results 是按实体类型分组的结果，不是按原始changes顺序
        const allSuccess = uploadResults.results.every(result => result?.success);
        
        if (allSuccess) {
          // 所有实体类型都上传成功，标记本批次所有变更为已同步
          successfulChangeIds = changes.map(c => c.id);
          await this.changeLog.markAsSynced(successfulChangeIds);
          totalPushed += successfulChangeIds.length;
          console.log(`[增量同步] 已标记 ${successfulChangeIds.length} 条变更为已同步`);
        } else {
          // 有部分失败，只标记成功的实体类型对应的变更
          const successfulEntityTypes = new Set();
          uploadResults.results.forEach((result, index) => {
            if (result?.success) {
              const [entityType] = Object.entries(groupedChanges)[index];
              successfulEntityTypes.add(entityType);
            }
          });
          
          successfulChangeIds = changes
            .filter(c => successfulEntityTypes.has(c.entity_type))
            .map(c => c.id);
          
          if (successfulChangeIds.length > 0) {
            await this.changeLog.markAsSynced(successfulChangeIds);
            totalPushed += successfulChangeIds.length;
            console.log(`[增量同步] 部分成功，已标记 ${successfulChangeIds.length}/${changes.length} 条变更为已同步`);
          }
        }

        // 收集错误
        if (uploadResults.errors && uploadResults.errors.length > 0) {
          errors.push(...uploadResults.errors);
        }
      } catch (error) {
        console.error('[增量同步] 批次上传失败:', error);
        errors.push(error);
        // 继续处理下一批
      }

      allChanges.push(...changes);
      offset += changes.length;

      // 如果这批数据少于 batchSize，说明没有更多数据了
      if (changes.length < this.batchSize) {
        hasMore = false;
      }
      
      // 关键：如果成功标记了变更，说明已处理，继续下一批
      // 如果没有成功标记任何变更，可能是失败了，避免无限循环
      if (successfulChangeIds.length === 0 && changes.length > 0) {
        console.warn('[增量同步] 本批次没有成功上传任何变更，停止继续处理避免无限循环');
        hasMore = false;
      }
    }

    if (this.isStopping) {
      console.log(`[增量同步] 推送被中断: ${totalPushed}/${allChanges.length} 个变更`);
    } else if (allChanges.length === 0) {
      console.log('[增量同步] 推送完成: 没有变更需要同步');
    } else {
      console.log(`[增量同步] 推送完成: ${totalPushed}/${allChanges.length} 个变更`);
    }

    // 如果有本地变更但没有成功推送任何一个，且有错误，应该抛出异常
    if (allChanges.length > 0 && totalPushed === 0 && errors.length > 0) {
      const errorMessage = errors[0]?.message || errors[0]?.toString() || '推送本地变更失败';
      console.error('[增量同步] 推送失败，抛出错误');
      throw new Error(`推送失败: ${errorMessage}`);
    }
    
    // 如果有部分失败，记录警告但不抛出异常（部分成功也算成功）
    if (errors.length > 0 && totalPushed > 0) {
      console.warn(`[增量同步] 推送部分成功: ${totalPushed}/${allChanges.length}, 有 ${errors.length} 个错误`);
    }

    return {
      count: totalPushed,
      total: allChanges.length,
      changes: allChanges,
      errors: errors
    };
  }

  /**
   * 拉取云端变更到本地
   */
  async pullRemoteChanges() {
    // 检查是否需要停止
    if (this.isStopping) {
      console.log('[增量同步] 收到停止信号，跳过拉取');
      return { count: 0, conflicts: [] };
    }
    
    // 获取上次同步时间
    const lastSyncTime = await this._getLastSyncTime();
    
    console.log(`[增量同步] 拉取自 ${lastSyncTime} 以来的远程变更...`);

    // 从云端获取变更
    const remoteChanges = await this._downloadRemoteChanges(lastSyncTime);
    
    if (!remoteChanges || remoteChanges.length === 0) {
      console.log('[增量同步] 没有远程变更需要拉取');
      return { count: 0, conflicts: [] };
    }

    console.log(`[增量同步] 收到 ${remoteChanges.length} 个远程变更`);

    // 应用远程变更
    const conflicts = [];
    let appliedCount = 0;

    for (const change of remoteChanges) {
      // 检查是否需要停止
      if (this.isStopping) {
        console.log('[增量同步] 收到停止信号，中断应用远程变更');
        break;
      }
      
      try {
        const result = await this._applyRemoteChange(change);
        if (result.conflict) {
          conflicts.push(result.conflict);
          
          // 如果需要用户干预，发出事件通知
          if (result.conflict.needsUserIntervention) {
            this._notifyConflict(result.conflict);
          }
        }
        if (result.applied) {
          appliedCount++;
        }
      } catch (error) {
        console.error(`[增量同步] 应用变更失败:`, error);
      }
    }

    // 更新最后同步时间
    await this._updateLastSyncTime();

    console.log(`[增量同步] 拉取完成: ${appliedCount}/${remoteChanges.length}, 冲突: ${conflicts.length}`);

    return {
      count: appliedCount,
      conflicts,
      total: remoteChanges.length
    };
  }

  /**
   * 通知冲突给主进程
   */
  _notifyConflict(conflict) {
    // 如果 provider 是 EventEmitter，通过它发出事件
    if (this.provider && typeof this.provider.emit === 'function') {
      this.provider.emit('conflictDetected', conflict);
    }
  }

  /**
   * 上传实体变更
   */
  async _uploadEntityChanges(entityType, changes) {
    // 构建变更包
    const changePackage = {
      entityType,
      changes: changes.map(c => ({
        id: c.id,
        entityId: c.entity_id,
        operation: c.operation,
        changeData: c.change_data,
        timestamp: c.created_at
      })),
      timestamp: new Date().toISOString(),
      deviceId: require('../utils/DeviceIdManager').getInstance().getShortDeviceId(),
      count: changes.length
    };

    console.log(`[增量同步] 上传 ${entityType} 变更包: ${changes.length} 条变更`);

    // 上传到云端（需要云端API支持）
    // 这里暂时使用文件方式模拟
    await this._uploadChangesToCloud(changePackage);

    return { success: true, count: changes.length };
  }

  /**
   * 应用远程变更
   */
  async _applyRemoteChange(change) {
    const { entityType, entityId, operation, changeData, timestamp } = change;

    try {
      // 获取本地实体（包括已删除的）
      const localEntity = await this._getLocalEntity(entityType, entityId);
      
      // 处理删除操作的特殊逻辑
      if (operation === 'delete') {
        return await this._handleRemoteDelete(entityType, entityId, localEntity, timestamp);
      }
      
      // 处理恢复操作
      if (operation === 'restore') {
        return await this._handleRemoteRestore(entityType, entityId, localEntity, timestamp);
      }
      
      // 检测冲突
      if (localEntity && operation !== 'create') {
        const hasConflict = await this._detectConflict(
          entityType,
          localEntity,
          changeData,
          timestamp
        );

        if (hasConflict) {
          // 使用冲突解决器
          const resolved = await this._resolveConflict(
            entityType,
            entityId,
            localEntity,
            changeData
          );
          
          // 如果需要用户干预，返回冲突信息
          if (resolved.needsUserIntervention) {
            return {
              applied: false,
              conflict: {
                entityType,
                entityId,
                local: localEntity,
                remote: changeData,
                conflicts: resolved.conflicts,
                needsUserIntervention: true
              }
            };
          }
          
          // 自动合并成功，应用解决后的变更
          if (resolved.merged) {
            await this._updateLocalEntity(entityType, entityId, resolved.merged);
            return { applied: true, conflict: null };
          }
        }
      }

      // 没有冲突，直接应用
      switch (operation) {
        case 'create':
          await this._createLocalEntity(entityType, changeData);
          break;
        case 'update':
          await this._updateLocalEntity(entityType, entityId, changeData);
          break;
      }

      return { applied: true, conflict: null };
    } catch (error) {
      console.error(`[增量同步] 应用变更失败 (${entityType}:${entityId}):`, error);
      throw error;
    }
  }

  /**
   * 处理远程删除操作
   */
  async _handleRemoteDelete(entityType, entityId, localEntity, remoteTimestamp) {
    if (!localEntity) {
      // 本地已经不存在了，无需处理
      return { applied: true, conflict: null };
    }

    // 检查本地是否在远程删除之后进行了修改
    const localTime = new Date(localEntity.updated_at).getTime();
    const remoteTime = new Date(remoteTimestamp).getTime();

    if (localTime > remoteTime) {
      // 本地在远程删除之后修改了，这是一个冲突
      console.warn(`[增量同步] 删除冲突: 远程删除了实体，但本地在之后进行了修改 (${entityType}:${entityId})`);
      return {
        applied: false,
        conflict: {
          entityType,
          entityId,
          type: 'delete-update-conflict',
          local: localEntity,
          remote: null,
          message: '远程已删除，但本地有更新',
          needsUserIntervention: true
        }
      };
    }

    // 本地版本更旧，执行删除
    await this._deleteLocalEntity(entityType, entityId);
    console.log(`[增量同步] 应用远程删除: ${entityType}:${entityId}`);
    return { applied: true, conflict: null };
  }

  /**
   * 处理远程恢复操作
   */
  async _handleRemoteRestore(entityType, entityId, localEntity, remoteTimestamp) {
    if (!localEntity || !localEntity.is_deleted) {
      // 本地没有被删除，无需恢复
      return { applied: true, conflict: null };
    }

    // 检查本地删除时间
    const localDeleteTime = new Date(localEntity.deleted_at || localEntity.updated_at).getTime();
    const remoteTime = new Date(remoteTimestamp).getTime();

    if (localDeleteTime > remoteTime) {
      // 本地删除时间晚于远程恢复时间，这是一个冲突
      console.warn(`[增量同步] 恢复冲突: 远程恢复了实体，但本地在之后删除了 (${entityType}:${entityId})`);
      return {
        applied: false,
        conflict: {
          entityType,
          entityId,
          type: 'restore-delete-conflict',
          local: localEntity,
          remote: { operation: 'restore' },
          message: '远程已恢复，但本地已删除',
          needsUserIntervention: true
        }
      };
    }

    // 本地删除时间更早，执行恢复
    await this._restoreLocalEntity(entityType, entityId);
    console.log(`[增量同步] 应用远程恢复: ${entityType}:${entityId}`);
    return { applied: true, conflict: null };
  }

  /**
   * 检测冲突
   */
  async _detectConflict(entityType, localEntity, remoteData, remoteTimestamp) {
    // 比较时间戳
    const localTime = new Date(localEntity.updated_at).getTime();
    const remoteTime = new Date(remoteTimestamp).getTime();
    
    // 如果本地版本更新，且内容不同，则存在冲突
    if (localTime > remoteTime) {
      return !this._areEntitiesEqual(localEntity, remoteData);
    }
    
    return false;
  }

  /**
   * 解决冲突
   */
  async _resolveConflict(entityType, entityId, localEntity, remoteEntity) {
    // 尝试获取共同祖先（如果有的话）
    const base = await this._getBaseVersion(entityType, entityId);
    
    if (base) {
      // 使用三向合并
      const mergeResult = ConflictResolver.threeWayMerge(base, localEntity, remoteEntity);
      
      // 如果三向合并检测到冲突，返回冲突信息让用户处理
      if (mergeResult.hasConflicts && mergeResult.conflicts.length > 0) {
        console.warn(`[增量同步] 检测到无法自动解决的冲突 (${entityType}:${entityId})`);
        return {
          merged: null,
          hasConflicts: true,
          conflicts: mergeResult.conflicts,
          needsUserIntervention: true
        };
      }
      
      // 三向合并成功，返回合并后的结果
      return {
        merged: mergeResult.merged,
        hasConflicts: false,
        conflicts: null
      };
    } else {
      // 无法获取共同祖先，无法进行三向合并
      // 这种情况下，必须让用户选择保留哪个版本
      console.warn(`[增量同步] 无法获取共同祖先，需要用户手动解决冲突 (${entityType}:${entityId})`);
      return {
        merged: null,
        hasConflicts: true,
        conflicts: [{
          field: '_全部内容_',
          type: 'conflict',
          local: localEntity,
          remote: remoteEntity,
          message: '本地和远程版本都已修改，但无法找到共同祖先进行自动合并'
        }],
        needsUserIntervention: true
      };
    }
  }

  /**
   * 实体操作辅助方法
   * 所有这些方法都使用 skipChangeLog: true 来防止无限循环
   * 
   * 注意：entityId 现在是 sync_id（UUID），而不是整数 id
   * 这确保了跨设备同步时能正确识别实体
   */
  async _getLocalEntity(entityType, entityId) {
    // 优先使用 sync_id 查找，因为 entityId 在同步时是 sync_id
    if (entityType === 'note') {
      // 先尝试通过 sync_id 查找
      let entity = this.noteDAO.findBySyncIdIncludeDeleted?.(entityId);
      if (!entity) {
        // 回退：尝试通过整数 id 查找（兼容旧数据）
        entity = this.noteDAO.findByIdIncludeDeleted?.(entityId) || this.noteDAO.findById?.(entityId);
      }
      return entity;
    } else if (entityType === 'todo') {
      // 先尝试通过 sync_id 查找
      let entity = this.todoDAO.findBySyncIdIncludeDeleted?.(entityId);
      if (!entity) {
        // 回退：尝试通过整数 id 查找（兼容旧数据）
        entity = this.todoDAO.findByIdIncludeDeleted?.(entityId);
      }
      return entity;
    }
    return null;
  }

  async _createLocalEntity(entityType, data) {
    // 使用 skipChangeLog 防止无限循环（从云端同步来的数据不应再触发新的变更日志）
    const options = { skipChangeLog: true };
    
    // 确保远程数据的 sync_id 被保留
    // 不要覆盖远程传来的 sync_id
    if (entityType === 'note') {
      return this.noteDAO.create(data, options);
    } else if (entityType === 'todo') {
      return this.todoDAO.create(data, options);
    }
  }

  async _updateLocalEntity(entityType, entityId, data) {
    // 使用 skipChangeLog 防止无限循环
    const options = { skipChangeLog: true };
    
    // 先通过 sync_id 找到本地实体，获取其整数 id
    const localEntity = await this._getLocalEntity(entityType, entityId);
    if (!localEntity) {
      console.warn(`[增量同步] 更新实体失败：找不到本地实体 (${entityType}:${entityId})`);
      return null;
    }
    
    // 使用本地实体的整数 id 进行更新
    if (entityType === 'note') {
      return this.noteDAO.update(localEntity.id, data, options);
    } else if (entityType === 'todo') {
      return this.todoDAO.update(localEntity.id, data, options);
    }
  }

  async _deleteLocalEntity(entityType, entityId) {
    // 使用 skipChangeLog 防止无限循环
    const options = { skipChangeLog: true };
    
    // 先通过 sync_id 找到本地实体，获取其整数 id
    const localEntity = await this._getLocalEntity(entityType, entityId);
    if (!localEntity) {
      console.warn(`[增量同步] 删除实体失败：找不到本地实体 (${entityType}:${entityId})`);
      return false;
    }
    
    if (entityType === 'note') {
      return this.noteDAO.softDelete(localEntity.id, options);
    } else if (entityType === 'todo') {
      return this.todoDAO.softDelete(localEntity.id, options);
    }
  }

  async _restoreLocalEntity(entityType, entityId) {
    // 使用 skipChangeLog 防止无限循环
    const options = { skipChangeLog: true };
    
    // 先通过 sync_id 找到本地实体，获取其整数 id
    const localEntity = await this._getLocalEntity(entityType, entityId);
    if (!localEntity) {
      console.warn(`[增量同步] 恢复实体失败：找不到本地实体 (${entityType}:${entityId})`);
      return false;
    }
    
    if (entityType === 'note') {
      return this.noteDAO.restore(localEntity.id, options);
    } else if (entityType === 'todo') {
      return this.todoDAO.restore(localEntity.id, options);
    }
  }

  /**
   * 辅助方法
   */
  _groupChangesByEntity(changes) {
    const grouped = {};
    for (const change of changes) {
      if (!grouped[change.entity_type]) {
        grouped[change.entity_type] = [];
      }
      grouped[change.entity_type].push(change);
    }
    return grouped;
  }

  _areEntitiesEqual(entity1, entity2) {
    // 简单比较关键字段
    const keys = ['content', 'title', 'tags', 'is_completed', 'is_deleted'];
    for (const key of keys) {
      if (entity1[key] !== entity2[key]) {
        return false;
      }
    }
    return true;
  }

  /**
   * 云端交互方法（需要根据实际云端API实现）
   */
  async _uploadChangesToCloud(changePackage) {
    if (!this.provider || !this.provider.uploadChanges) {
      console.warn('[增量同步] 云端提供商不支持增量上传，跳过');
      return;
    }
    
    // 文件名格式: changes-{entityType}-{deviceId}-{timestamp}.json
    const deviceId = getDeviceIdManager().getShortDeviceId();
    const filename = `changes-${changePackage.entityType}-${deviceId}-${Date.now()}.json`;
    const filepath = `/FlashNote/incremental/${filename}`;
    
    try {
      await this.provider.uploadChanges(filepath, changePackage);
      console.log(`[增量同步] 上传变更包成功: ${filename}`);
    } catch (error) {
      console.error(`[增量同步] 上传变更包失败: ${filename}`, error);
      // 改进错误信息
      let errorMessage = error.message;
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        errorMessage = '网络连接失败，无法访问坚果云服务器';
      } else if (error.response?.status === 401) {
        errorMessage = '坚果云认证失败，请检查用户名和应用密码';
      } else if (error.response?.status === 403) {
        errorMessage = '没有权限访问坚果云，请检查账户权限';
      } else if (error.response?.status === 507) {
        errorMessage = '坚果云存储空间不足';
      }
      throw new Error(`上传变更包失败: ${errorMessage}`);
    }
  }

  async _downloadRemoteChanges(since) {
    if (!this.provider || !this.provider.downloadChanges) {
      console.warn('[增量同步] 云端提供商不支持增量下载，返回空列表');
      return [];
    }
    
    try {
      const changes = await this.provider.downloadChanges(since);
      console.log(`[增量同步] 下载远程变更成功 (since: ${since}): ${changes.length} 条`);
      return changes;
    } catch (error) {
      console.error(`[增量同步] 下载远程变更失败`, error);
      // 不要吞掉错误，让调用者知道失败了
      throw error;
    }
  }

  async _getBaseVersion(entityType, entityId) {
    if (!this.provider || !this.provider.getVersionHistory) {
      console.warn('[增量同步] 云端提供商不支持版本历史，无法执行三向合并');
      return null;
    }
    
    try {
      // 获取该实体的版本历史
      const versions = await this.provider.getVersionHistory(entityType, entityId);
      
      if (!versions || versions.length === 0) {
        console.log(`[增量同步] 实体 ${entityType}:${entityId} 没有版本历史`);
        return null;
      }
      
      // 获取最近一次同步时的版本作为共同祖先
      // 版本按时间降序排列，第二个版本（索引1）通常是上次同步的版本
      const baseVersion = versions.length > 1 ? versions[1] : versions[0];
      
      console.log(`[增量同步] 找到共同祖先版本: ${entityType}:${entityId} @ ${baseVersion.timestamp}`);
      return baseVersion.data;
    } catch (error) {
      console.error(`[增量同步] 获取基础版本失败 (${entityType}:${entityId})`, error);
      return null;
    }
  }

  async _getLastSyncTime() {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    
    const syncTimePath = path.join(app.getPath('userData'), 'last-sync-time.txt');
    
    if (fs.existsSync(syncTimePath)) {
      return fs.readFileSync(syncTimePath, 'utf8').trim();
    }
    
    // 默认返回30天前
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo.toISOString();
  }

  async _updateLastSyncTime() {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    
    const syncTimePath = path.join(app.getPath('userData'), 'last-sync-time.txt');
    fs.writeFileSync(syncTimePath, new Date().toISOString());
  }

  /**
   * 清理旧的变更记录
   */
  async cleanupOldChanges() {
    const daysToKeep = 30;
    const deleted = await this.changeLog.cleanupOldChanges(daysToKeep);
    console.log(`[增量同步] 清理了 ${deleted} 条旧变更记录`);
    return deleted;
  }

  /**
   * 获取同步统计
   */
  async getStats() {
    return await this.changeLog.getStats();
  }

  /**
   * 停止同步
   */
  stopSync() {
    console.log('[增量同步] 请求停止同步');
    this.isStopping = true;
  }

  /**
   * 重置停止标志
   */
  resetStopFlag() {
    this.isStopping = false;
  }
}

module.exports = IncrementalSyncService;
