import { useState, useEffect } from 'react'
import { getPluginsBySurface, executePluginCommand } from '../api/pluginAPI'

/**
 * 加载指定扩展点的插件按钮
 * @param {string} surface - 扩展点名称
 * @param {Object} context - 传递给插件命令的上下文数据
 * @returns {Array} 插件扩展按钮配置数组
 */
export const usePluginExtensions = (surface, context = {}) => {
  const [extensions, setExtensions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadExtensions = async () => {
      setLoading(true)
      try {
        const commands = await getPluginsBySurface(surface)
        setExtensions(commands)
      } catch (error) {
        console.error(`[usePluginExtensions] 加载扩展点 ${surface} 失败:`, error)
        setExtensions([])
      } finally {
        setLoading(false)
      }
    }

    loadExtensions()

    // 监听插件安装/卸载事件，重新加载扩展
    const handlePluginChange = () => {
      loadExtensions()
    }

    window.addEventListener('plugin-installed', handlePluginChange)
    window.addEventListener('plugin-uninstalled', handlePluginChange)
    window.addEventListener('plugin-enabled', handlePluginChange)
    window.addEventListener('plugin-disabled', handlePluginChange)

    return () => {
      window.removeEventListener('plugin-installed', handlePluginChange)
      window.removeEventListener('plugin-uninstalled', handlePluginChange)
      window.removeEventListener('plugin-enabled', handlePluginChange)
      window.removeEventListener('plugin-disabled', handlePluginChange)
    }
  }, [surface])

  /**
   * 执行插件命令的包装函数
   * @param {Object} extension - 插件扩展配置
   * @param {Object} additionalContext - 额外的上下文数据
   * @returns {Promise<any>} 命令执行结果
   */
  const executeExtension = async (extension, additionalContext = {}) => {
    try {
      const result = await executePluginCommand(
        extension.pluginId,
        extension.commandId,
        { ...context, ...additionalContext }
      )
      return result
    } catch (error) {
      console.error(`[usePluginExtensions] 执行插件命令失败:`, error)
      throw error
    }
  }

  return {
    extensions,
    loading,
    executeExtension
  }
}
