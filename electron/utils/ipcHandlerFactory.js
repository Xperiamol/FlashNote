/**
 * IPC Handler 工厂
 * 消除重复的错误处理代码，符合 DRY 原则
 */
class IpcHandlerFactory {
  /**
   * 创建一个带标准错误处理的 IPC handler
   * @param {Function} handler - 实际的处理函数
   * @param {string} errorPrefix - 错误日志前缀
   * @param {object} defaultErrorResponse - 默认错误响应
   * @returns {Function} 包装后的 handler
   */
  static createHandler(handler, errorPrefix = '操作失败', defaultErrorResponse = {}) {
    return async (event, ...args) => {
      try {
        const result = await handler(event, ...args);
        return result;
      } catch (error) {
        console.error(`${errorPrefix}:`, error);
        return {
          success: false,
          error: error.message,
          ...defaultErrorResponse
        };
      }
    };
  }

  /**
   * 创建简单的服务方法调用 handler
   * @param {object} service - 服务实例
   * @param {string} methodName - 方法名
   * @param {string} errorPrefix - 错误日志前缀
   * @returns {Function} handler
   */
  static createServiceHandler(service, methodName, errorPrefix) {
    return this.createHandler(
      async (event, params) => {
        return await service[methodName](...Object.values(params));
      },
      errorPrefix
    );
  }

  /**
   * 创建带结果包装的 handler
   * @param {object} service - 服务实例
   * @param {string} methodName - 方法名
   * @param {string} resultKey - 结果键名
   * @param {string} errorPrefix - 错误日志前缀
   * @param {any} defaultValue - 错误时的默认值
   * @returns {Function} handler
   */
  static createWrappedServiceHandler(
    service, 
    methodName, 
    resultKey, 
    errorPrefix,
    defaultValue = null
  ) {
    return this.createHandler(
      async (event, params) => {
        const result = await service[methodName](...Object.values(params));
        return { success: true, [resultKey]: result };
      },
      errorPrefix,
      { [resultKey]: defaultValue }
    );
  }
}

module.exports = IpcHandlerFactory;
