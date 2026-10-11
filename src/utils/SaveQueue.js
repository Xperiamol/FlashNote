/**
 * 保存队列管理器
 * 防止并发保存冲突，确保保存操作按顺序执行
 */
import logger from './logger';
import { registerEditorSaver } from './editorSaveRegistry';

class SaveQueue {
  constructor() {
    this.queue = [];
    this.pending = new Set();
    this.failures = new Map();
    this.isSaving = false;
  }

  /**
   * 添加保存任务到队列
   * @param {string} id - 项目ID（笔记ID或待办ID）
   * @param {Function} saveFunc - 保存函数
   * @returns {Promise} 保存完成的Promise
   */
  async add(id, saveFunc) {
    // 保存屏障依赖每个请求的真实完成结果，不能把被替换的请求提前 resolve。

    // 创建新的保存任务
    const task = {
      id,
      saveFunc,
      promise: null,
      resolve: null,
      reject: null
    };

    // 创建Promise
    task.promise = new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });

    this.pending.add(task.promise);
    task.promise.then(() => this.pending.delete(task.promise), () => this.pending.delete(task.promise));
    // 添加到队列
    this.queue.push(task);

    // 如果当前没有正在执行的保存，立即开始处理
    if (!this.isSaving) {
      this.processQueue();
    }

    return task.promise;
  }

  /**
   * 处理队列中的保存任务
   */
  async processQueue() {
    if (this.isSaving || this.queue.length === 0) {
      return;
    }

    this.isSaving = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();

      try {
        logger.log(`[SaveQueue] 开始保存: ${task.id}`);
        
        const result = await task.saveFunc();
        if (result === false || result?.success === false || result?.cancelled) throw new Error(result?.error || '保存未完成');
        this.failures.delete(task.id);
        
        logger.log(`[SaveQueue] 保存成功: ${task.id}`);
        task.resolve();
      } catch (error) {
        console.error(`[SaveQueue] 保存失败: ${task.id}`, error);
        this.failures.set(task.id, error);
        task.reject(error);
      }
    }

    this.isSaving = false;
  }

  async flush() {
    while (this.pending.size) {
      await Promise.allSettled([...this.pending]);
    }
    if (this.failures.size) throw new Error('仍有笔记保存失败，请返回该笔记重试保存后再同步或退出');
  }


}

// 导出单例实例
export const saveQueue = new SaveQueue();
registerEditorSaver(() => saveQueue.flush(), 1);

export default SaveQueue;
