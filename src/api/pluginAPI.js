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

export const fetchLocalPlugins = async () => {
  const bridge = getBridge()
  if (!bridge) return []
  return toResult(bridge.scanLocalPlugins())
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

export const openPluginFolder = async (pluginId) => {
  const bridge = getBridge()
  if (!bridge) return { success: false, error: '插件桥不可用' }
  return toResult(bridge.openPluginFolder(pluginId))
}

export const openPluginsDirectory = async () => {
  const bridge = getBridge()
  if (!bridge) return { success: false, error: '插件桥不可用' }
  return toResult(bridge.openPluginsDirectory())
}

export const loadPluginFile = async (pluginId, filePath) => {
  const bridge = getBridge()
  if (!bridge) return { success: false, error: '插件桥不可用' }
  return toResult(bridge.loadPluginFile(pluginId, filePath))
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

export const subscribePluginWindowRequests = (callback) => {
  const bridge = getBridge()
  if (!bridge) return () => {}
  return bridge.onOpenWindow(callback)
}

/**
 * 获取指定扩展点的插件命令
 * @param {string} surface - 扩展点名称，如 'tag-input', 'toolbar:notes' 等
 * @returns {Promise<Array>} 插件命令列表
 */
export const getPluginsBySurface = async (surface) => {
  const bridge = getBridge()
  if (!bridge) return []
  
  try {
    // 获取所有已安装且启用的插件
    const plugins = await toResult(bridge.listInstalled())
    const surfaceCommands = []
    
    for (const plugin of plugins) {
      if (!plugin.enabled || !plugin.manifest?.commands) continue
      
      // 查找该插件中声明了指定 surface 的命令
      for (const command of plugin.manifest.commands) {
        if (command.surfaces && command.surfaces.includes(surface)) {
          surfaceCommands.push({
            pluginId: plugin.id,
            pluginName: plugin.name,
            commandId: command.id,
            title: command.title,
            icon: command.icon,
            description: command.description
          })
        }
      }
    }
    
    return surfaceCommands
  } catch (error) {
    console.error('[pluginAPI] 获取扩展点插件失败', error)
    return []
  }
}
