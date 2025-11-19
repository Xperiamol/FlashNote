/**
 * 冲突解决工具 - 提供更智能的冲突解决策略
 */
class ConflictResolver {
  /**
   * 三向合并 - 基于共同祖先版本进行智能合并
   * @param {object} base - 共同祖先版本
   * @param {object} local - 本地版本
   * @param {object} remote - 远程版本
   * @returns {object} 合并结果 { merged, conflicts }
   */
  static threeWayMerge(base, local, remote) {
    const merged = {};
    const conflicts = [];

    // 获取所有字段的集合
    const allKeys = new Set([
      ...Object.keys(base || {}),
      ...Object.keys(local || {}),
      ...Object.keys(remote || {})
    ]);

    for (const key of allKeys) {
      // 跳过ID和时间戳字段
      if (key === 'id') {
        merged[key] = local[key];
        continue;
      }

      const baseValue = base ? base[key] : undefined;
      const localValue = local[key];
      const remoteValue = remote[key];

      // 情况1: 三者相同
      if (this._isEqual(baseValue, localValue) && this._isEqual(localValue, remoteValue)) {
        merged[key] = localValue;
        continue;
      }

      // 情况2: 只有本地修改
      if (!this._isEqual(baseValue, localValue) && this._isEqual(baseValue, remoteValue)) {
        merged[key] = localValue;
        continue;
      }

      // 情况3: 只有远程修改
      if (this._isEqual(baseValue, localValue) && !this._isEqual(baseValue, remoteValue)) {
        merged[key] = remoteValue;
        continue;
      }

      // 情况4: 本地和远程都修改了，且值相同
      if (!this._isEqual(baseValue, localValue) && !this._isEqual(baseValue, remoteValue)) {
        if (this._isEqual(localValue, remoteValue)) {
          merged[key] = localValue;
          continue;
        }

        // 情况5: 本地和远程都修改了，但值不同 - 真正的冲突
        conflicts.push({
          field: key,
          base: baseValue,
          local: localValue,
          remote: remoteValue
        });

        // 默认策略：使用更新的值（基于时间戳或长度）
        merged[key] = this._resolveFieldConflict(key, localValue, remoteValue, local, remote);
      }
    }

    // 处理时间戳
    merged.updated_at = this._getLatestTimestamp(local.updated_at, remote.updated_at);
    if (local.created_at) {
      merged.created_at = this._getEarliestTimestamp(local.created_at, remote.created_at);
    }

    return {
      merged,
      conflicts: conflicts.length > 0 ? conflicts : null
    };
  }

  /**
   * 比较两个值是否相等
   */
  static _isEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    
    // 对于字符串和数字，直接比较
    if (typeof a !== 'object' || typeof b !== 'object') {
      return a === b;
    }
    
    // 对于对象，进行深度比较
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * 解决单个字段的冲突
   */
  static _resolveFieldConflict(fieldName, localValue, remoteValue, localItem, remoteItem) {
    // 对于内容字段，选择更长的版本（可能包含更多信息）
    if (fieldName === 'content' || fieldName === 'description') {
      const localLength = (localValue || '').length;
      const remoteLength = (remoteValue || '').length;
      return localLength >= remoteLength ? localValue : remoteValue;
    }

    // 对于标题，选择非空的
    if (fieldName === 'title') {
      if (!localValue) return remoteValue;
      if (!remoteValue) return localValue;
      return localValue.length >= remoteValue.length ? localValue : remoteValue;
    }

    // 对于布尔标志，使用最新的值
    if (typeof localValue === 'boolean' || typeof remoteValue === 'boolean') {
      const localTime = new Date(localItem.updated_at || 0).getTime();
      const remoteTime = new Date(remoteItem.updated_at || 0).getTime();
      return remoteTime > localTime ? remoteValue : localValue;
    }

    // 默认：选择最新修改的版本
    const localTime = new Date(localItem.updated_at || 0).getTime();
    const remoteTime = new Date(remoteItem.updated_at || 0).getTime();
    return remoteTime > localTime ? remoteValue : localValue;
  }

  /**
   * 获取较晚的时间戳
   */
  static _getLatestTimestamp(time1, time2) {
    if (!time1) return time2;
    if (!time2) return time1;
    return new Date(time1) > new Date(time2) ? time1 : time2;
  }

  /**
   * 获取较早的时间戳
   */
  static _getEarliestTimestamp(time1, time2) {
    if (!time1) return time2;
    if (!time2) return time1;
    return new Date(time1) < new Date(time2) ? time1 : time2;
  }

  /**
   * 简单合并（不使用共同祖先）
   * 回退策略，当没有共同祖先时使用
   */
  static simpleMerge(local, remote) {
    const merged = { ...remote };

    for (const key in local) {
      // 跳过某些字段
      if (key === 'id' || key === 'created_at') {
        merged[key] = local[key];
        continue;
      }

      // 如果本地值存在且更长/更新，使用本地值
      if (local[key]) {
        if (!remote[key]) {
          merged[key] = local[key];
        } else if (typeof local[key] === 'string' && typeof remote[key] === 'string') {
          // 字符串：选择更长的
          merged[key] = local[key].length >= remote[key].length ? local[key] : remote[key];
        } else if (key === 'updated_at') {
          // 时间戳：选择更新的
          merged[key] = this._getLatestTimestamp(local[key], remote[key]);
        } else {
          // 其他：基于updated_at选择
          const localTime = new Date(local.updated_at || 0).getTime();
          const remoteTime = new Date(remote.updated_at || 0).getTime();
          merged[key] = remoteTime > localTime ? remote[key] : local[key];
        }
      }
    }

    merged.updated_at = this._getLatestTimestamp(local.updated_at, remote.updated_at);
    
    return merged;
  }

  /**
   * 检测是否存在真正的冲突
   * @returns {boolean} 是否存在无法自动解决的冲突
   */
  static hasUnresolvableConflicts(base, local, remote) {
    const result = this.threeWayMerge(base, local, remote);
    return result.conflicts && result.conflicts.length > 0;
  }

  /**
   * 创建冲突报告
   */
  static createConflictReport(entityType, entityId, base, local, remote) {
    const result = this.threeWayMerge(base, local, remote);
    
    return {
      entityType,
      entityId,
      hasConflicts: result.conflicts && result.conflicts.length > 0,
      conflicts: result.conflicts,
      merged: result.merged,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ConflictResolver;
