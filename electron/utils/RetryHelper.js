/**
 * 网络重试工具 - 实现指数退避重试策略
 */
class RetryHelper {
  /**
   * 执行带重试的异步操作
   * @param {Function} operation - 要执行的异步操作
   * @param {Object} options - 重试选项
   * @returns {Promise} 操作结果
   */
  static async executeWithRetry(operation, options = {}) {
    const {
      maxRetries = 5,
      initialDelay = 1000, // 初始延迟1秒
      maxDelay = 30000, // 最大延迟30秒
      factor = 2, // 指数因子
      onRetry = null, // 重试回调函数
      retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH', 503, 429, 502, 504]
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 执行操作
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error;

        // 检查是否应该重试
        if (!this._shouldRetry(error, retryableErrors)) {
          throw error;
        }

        // 如果已达到最大重试次数，抛出错误
        if (attempt >= maxRetries) {
          throw new Error(
            `操作失败，已重试 ${maxRetries} 次。最后错误: ${error.message}`
          );
        }

        // 计算下次重试的延迟时间（指数退避）
        const jitter = Math.random() * 0.3 * delay; // 添加30%的抖动
        const currentDelay = Math.min(delay + jitter, maxDelay);

        console.log(
          `操作失败 (尝试 ${attempt + 1}/${maxRetries + 1}): ${error.message}`
        );
        console.log(`${currentDelay}ms 后重试...`);

        // 调用重试回调
        if (onRetry) {
          await onRetry(attempt, currentDelay, error);
        }

        // 等待后重试
        await this._sleep(currentDelay);

        // 增加延迟时间（指数增长）
        delay = Math.min(delay * factor, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * 判断错误是否应该重试
   */
  static _shouldRetry(error, retryableErrors) {
    // 检查错误码
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }

    // 检查HTTP状态码
    if (error.response && error.response.status) {
      return retryableErrors.includes(error.response.status);
    }

    // 检查特定的错误消息
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('service unavailable')
    ) {
      return true;
    }

    return false;
  }

  /**
   * 睡眠指定毫秒数
   */
  static _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 批量执行操作，失败时使用指数退避重试
   * @param {Array} items - 要处理的项目列表
   * @param {Function} operation - 处理每个项目的操作
   * @param {Object} options - 选项
   */
  static async executeBatchWithRetry(items, operation, options = {}) {
    const {
      batchSize = 10,
      onProgress = null,
      continueOnError = false
    } = options;

    const results = [];
    const errors = [];

    // 分批处理
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, Math.min(i + batchSize, items.length));

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const index = i + j;

        try {
          const result = await this.executeWithRetry(
            () => operation(item, index),
            options
          );
          results.push({ index, item, result, success: true });

          if (onProgress) {
            onProgress(index + 1, items.length, null);
          }
        } catch (error) {
          const errorInfo = { index, item, error, success: false };
          errors.push(errorInfo);
          results.push(errorInfo);

          if (onProgress) {
            onProgress(index + 1, items.length, error);
          }

          if (!continueOnError) {
            throw error;
          }
        }
      }
    }

    return {
      results,
      errors,
      successCount: results.filter(r => r.success).length,
      errorCount: errors.length
    };
  }

  /**
   * 使用断路器模式执行操作
   * 当连续失败次数达到阈值时，暂时停止尝试
   */
  static createCircuitBreaker(options = {}) {
    const {
      failureThreshold = 5, // 失败阈值
      resetTimeout = 60000, // 重置超时时间（毫秒）
      halfOpenRequests = 3 // 半开状态下允许的请求数
    } = options;

    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    let failureCount = 0;
    let nextAttemptTime = Date.now();
    let halfOpenCount = 0;

    return {
      async execute(operation) {
        // 如果断路器打开，检查是否可以尝试半开状态
        if (state === 'OPEN') {
          if (Date.now() < nextAttemptTime) {
            throw new Error('断路器已打开，服务暂时不可用');
          }
          state = 'HALF_OPEN';
          halfOpenCount = 0;
        }

        try {
          const result = await operation();

          // 成功：重置计数器
          if (state === 'HALF_OPEN') {
            halfOpenCount++;
            if (halfOpenCount >= halfOpenRequests) {
              state = 'CLOSED';
              failureCount = 0;
              console.log('断路器已关闭，服务恢复正常');
            }
          } else {
            failureCount = 0;
          }

          return result;
        } catch (error) {
          failureCount++;

          if (state === 'HALF_OPEN' || failureCount >= failureThreshold) {
            state = 'OPEN';
            nextAttemptTime = Date.now() + resetTimeout;
            console.warn(
              `断路器已打开，将在 ${resetTimeout}ms 后尝试恢复`
            );
          }

          throw error;
        }
      },

      getState() {
        return { state, failureCount, nextAttemptTime };
      },

      reset() {
        state = 'CLOSED';
        failureCount = 0;
        nextAttemptTime = Date.now();
      }
    };
  }
}

module.exports = RetryHelper;
