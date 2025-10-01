const getBridge = () => {
  if (typeof window === 'undefined') return null
  return window.electronAPI?.pluginStore || null
}

const toResult = async (promise) => {
  try {
    return await promise
  } catch (error) {
    console.error('[pluginAPI] 调用失败', error)
    throw error
  }
}

export const fetchAvailablePlugins = async () => {
  const bridge = getBridge()
  if (!bridge) return []
  return toResult(bridge.listAvailable())
}

export const fetchInstalledPlugins = async () => {
  const bridge = getBridge()
  if (!bridge) return []
  return toResult(bridge.listInstalled())
}

export const fetchPluginDetails = async (pluginId) => {
  const bridge = getBridge()
  if (!bridge) return null
  return toResult(bridge.getDetails(pluginId))
}

export const installPlugin = async (pluginId) => {
  const bridge = getBridge()
  if (!bridge) return { success: false, error: '插件桥不可用' }
  return toResult(bridge.install(pluginId))
}

export const uninstallPlugin = async (pluginId) => {
  const bridge = getBridge()
  if (!bridge) return { success: false, error: '插件桥不可用' }
  return toResult(bridge.uninstall(pluginId))
}

export const enablePlugin = async (pluginId) => {
  const bridge = getBridge()
  if (!bridge) return { success: false, error: '插件桥不可用' }
  return toResult(bridge.enable(pluginId))
}

export const disablePlugin = async (pluginId) => {
  const bridge = getBridge()
  if (!bridge) return { success: false, error: '插件桥不可用' }
  return toResult(bridge.disable(pluginId))
}

export const executePluginCommand = async (pluginId, commandId, payload = {}) => {
  const bridge = getBridge()
  if (!bridge) return { success: false, error: '插件桥不可用' }
  return toResult(bridge.executeCommand(pluginId, commandId, payload))
}

export const subscribePluginEvents = (callback) => {
  const bridge = getBridge()
  if (!bridge) return () => {}
  return bridge.onEvent(callback)
}

export const subscribePluginUiRequests = (callback) => {
  const bridge = getBridge()
  if (!bridge) return () => {}
  return bridge.onUiRequest(callback)
}
