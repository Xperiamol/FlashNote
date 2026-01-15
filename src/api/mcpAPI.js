/**
 * MCP 相关 API
 * 用于管理 MCP Server 的安装、启用和配置
 */

const toResult = (promise) =>
  promise.then((res) => res).catch((err) => ({ success: false, error: err.message }))

/**
 * 检查 MCP Server 是否已安装
 */
export const checkMCPInstalled = async () => {
  if (!window.electronAPI?.mcp) return { success: false, error: 'MCP API 不可用' }
  return toResult(window.electronAPI.mcp.checkInstalled())
}

/**
 * 获取 MCP Server 安装信息
 */
export const getMCPInstallInfo = async () => {
  if (!window.electronAPI?.mcp) return { success: false, error: 'MCP API 不可用' }
  return toResult(window.electronAPI.mcp.getInstallInfo())
}

/**
 * 安装 MCP Server
 */
export const installMCPServer = async () => {
  if (!window.electronAPI?.mcp) return { success: false, error: 'MCP API 不可用' }
  return toResult(window.electronAPI.mcp.install())
}

/**
 * 卸载 MCP Server
 */
export const uninstallMCPServer = async () => {
  if (!window.electronAPI?.mcp) return { success: false, error: 'MCP API 不可用' }
  return toResult(window.electronAPI.mcp.uninstall())
}

/**
 * 获取 MCP 配置文件路径
 */
export const getMCPConfigPath = async () => {
  if (!window.electronAPI?.mcp) return { success: false, error: 'MCP API 不可用' }
  return toResult(window.electronAPI.mcp.getConfigPath())
}

export default {
  checkMCPInstalled,
  getMCPInstallInfo,
  installMCPServer,
  uninstallMCPServer,
  getMCPConfigPath
}
