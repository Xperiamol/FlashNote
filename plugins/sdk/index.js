// FlashNote 插件 SDK 占位文件
// 实际运行时的 API 由主进程在 Worker 中注入并覆盖这些占位实现
// 当在 FlashNote 环境外 require 该模块时，我们返回友好的提示

const createUnavailableProxy = (method) => () => {
	throw new Error(`FlashNote 插件 SDK: ${method} 只能在 FlashNote 应用内调用`)
}

const sdkProxy = new Proxy(
	{},
	{
		get: (_, key) => {
			if (key === '__isFlashNoteRuntime') {
				return false
			}
			const method = key ? String(key) : '该 API'
			return createUnavailableProxy(method)
		}
	}
)

module.exports = sdkProxy
