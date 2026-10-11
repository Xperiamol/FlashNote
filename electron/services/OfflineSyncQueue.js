const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { getInstance: getNetworkService } = require('./NetworkService')
const { writeFileAtomicSync } = require('../utils/atomicFile')

/**
 * 离线同步队列
 * 当网络不可用时缓存同步操作，恢复后自动重放
 */
class OfflineSyncQueue {
  constructor() {
    this._queue = []
    this._filePath = path.join(app.getPath('userData'), 'offline-sync-queue.json')
    this._processing = false
    this._syncFn = null
    this._load()
  }

  /** 设置实际的同步执行函数 */
  setSyncFunction(fn) {
    this._syncFn = fn
  }

  /** 入队一个同步操作 */
  enqueue(operation) {
    if (this._loadError) throw this._loadError
    const next = [...this._queue, {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      ...operation,
    }]
    this._save(next)
    this._queue = next
  }

  /** 队列长度 */
  get length() {
    return this._queue.length
  }

  /** 尝试重放队列（在线时调用） */
  async flush() {
    if (this._processing || this._queue.length === 0 || !this._syncFn) return
    const network = getNetworkService()
    if (!network.isOnline) return

    this._processing = true
    const batch = new Set(this._queue.map(operation => operation.id))
    try {
      // 触发一次完整同步即可（V3 增量同步会包含所有 pending changes）
      const result = await this._syncFn()
      if (result?.success !== true) throw new Error(result?.error || '同步尚未全部完成，保留重试队列')
      // 同步期间新入队的操作属于下一轮，不能一起删掉。
      const remaining = this._queue.filter(operation => !batch.has(operation.id))
      this._save(remaining)
      this._queue = remaining
      return result
    } catch (e) {
      console.error('[OfflineSyncQueue] flush 失败:', e.message)
    } finally {
      this._processing = false
    }
  }

  /** 监听网络恢复并自动 flush */
  startAutoFlush() {
    if (this._retryTimer) return
    const network = getNetworkService()
    network.on('status-changed', (online) => {
      if (online && this._queue.length > 0) {
        console.log('[OfflineSyncQueue] 网络恢复，开始重放队列...')
        this.flush()
      }
    })
    this._retryTimer = setInterval(() => this.flush(), 60000)
    this._retryTimer.unref?.()
    this.flush()
  }

  _load() {
    try {
      if (fs.existsSync(this._filePath)) {
        this._queue = JSON.parse(fs.readFileSync(this._filePath, 'utf8'))
        if (!Array.isArray(this._queue)) throw new Error('离线队列格式无效')
      }
    } catch (error) {
      this._loadError = new Error(`无法读取离线同步队列：${error.message}`)
      console.error(this._loadError)
      this._queue = []
    }
  }

  _save(queue = this._queue) {
    writeFileAtomicSync(this._filePath, JSON.stringify(queue))
  }
}

let _instance = null
function getInstance() {
  if (!_instance) _instance = new OfflineSyncQueue()
  return _instance
}

module.exports = { OfflineSyncQueue, getInstance }
