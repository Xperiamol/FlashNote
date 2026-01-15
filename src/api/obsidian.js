/**
 * Obsidian 导入导出 API
 * 提供与 Obsidian 相关的导入导出功能
 */

import { invoke } from './ipc';

/**
 * 导入 Obsidian vault
 * @param {object} options - 导入选项
 * @param {string} options.folderPath - Vault 文件夹路径（可选，不提供则弹出选择对话框）
 * @param {object} options.config - 导入器配置（可选）
 * @param {boolean} options.importAttachments - 是否导入附件（默认：true）
 * @param {boolean} options.createCategories - 是否根据文件夹结构创建分类（默认：true）
 * @returns {Promise<object>} 导入结果
 */
export const importObsidianVault = async (options = {}) => {
  try {
    const result = await invoke('data:import-obsidian-vault', options);
    return { success: true, data: result };
  } catch (error) {
    console.error('导入 Obsidian vault 失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 导出到 Obsidian 格式
 * @param {object} options - 导出选项
 * @param {string} options.exportPath - 导出路径（可选，不提供则弹出选择对话框）
 * @param {object} options.filters - 笔记过滤条件（可选）
 * @param {object} options.config - 导出器配置（可选）
 * @returns {Promise<object>} 导出结果
 */
export const exportToObsidian = async (options = {}) => {
  try {
    const result = await invoke('data:export-to-obsidian', options);
    return { success: true, data: result };
  } catch (error) {
    console.error('导出到 Obsidian 失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 获取导入器配置
 * @param {string} importerName - 导入器名称（如：'obsidian'）
 * @returns {Promise<object>} 配置对象
 */
export const getImporterConfig = async (importerName) => {
  try {
    const result = await invoke('data:get-importer-config', importerName);
    return { success: true, data: result };
  } catch (error) {
    console.error('获取导入器配置失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 更新导入器配置
 * @param {string} importerName - 导入器名称
 * @param {object} config - 新配置
 * @returns {Promise<object>} 更新结果
 */
export const updateImporterConfig = async (importerName, config) => {
  try {
    const result = await invoke('data:update-importer-config', {
      importerName,
      config
    });
    return { success: true, data: result };
  } catch (error) {
    console.error('更新导入器配置失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 获取导出器配置
 * @param {string} exporterName - 导出器名称（如：'obsidian'）
 * @returns {Promise<object>} 配置对象
 */
export const getExporterConfig = async (exporterName) => {
  try {
    const result = await invoke('data:get-exporter-config', exporterName);
    return { success: true, data: result };
  } catch (error) {
    console.error('获取导出器配置失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 更新导出器配置
 * @param {string} exporterName - 导出器名称
 * @param {object} config - 新配置
 * @returns {Promise<object>} 更新结果
 */
export const updateExporterConfig = async (exporterName, config) => {
  try {
    const result = await invoke('data:update-exporter-config', {
      exporterName,
      config
    });
    return { success: true, data: result };
  } catch (error) {
    console.error('更新导出器配置失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 获取所有可用的导入导出器
 * @returns {Promise<object>} { importers: [], exporters: [] }
 */
export const getAvailableImportersAndExporters = async () => {
  try {
    const result = await invoke('data:get-available-importers-exporters');
    return { success: true, data: result };
  } catch (error) {
    console.error('获取可用导入导出器失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 监听导入进度事件
 * @param {string} eventName - 事件名称
 * @param {function} callback - 回调函数
 * @returns {function} 取消监听的函数
 */
export const onImportProgress = (eventName, callback) => {
  if (typeof window === 'undefined' || !window.electronAPI) {
    console.warn('Electron API 不可用');
    return () => {};
  }

  const channel = `obsidian-${eventName}`;
  
  if (window.electronAPI.on) {
    window.electronAPI.on(channel, callback);
    
    // 返回取消监听的函数
    return () => {
      if (window.electronAPI.removeListener) {
        window.electronAPI.removeListener(channel, callback);
      }
    };
  }
  
  return () => {};
};

/**
 * 监听导出进度事件
 * @param {string} eventName - 事件名称
 * @param {function} callback - 回调函数
 * @returns {function} 取消监听的函数
 */
export const onExportProgress = (eventName, callback) => {
  if (typeof window === 'undefined' || !window.electronAPI) {
    console.warn('Electron API 不可用');
    return () => {};
  }

  const channel = `obsidian-${eventName}`;
  
  if (window.electronAPI.on) {
    window.electronAPI.on(channel, callback);
    
    // 返回取消监听的函数
    return () => {
      if (window.electronAPI.removeListener) {
        window.electronAPI.removeListener(channel, callback);
      }
    };
  }
  
  return () => {};
};

// 默认导出
export default {
  importObsidianVault,
  exportToObsidian,
  getImporterConfig,
  updateImporterConfig,
  getExporterConfig,
  updateExporterConfig,
  getAvailableImportersAndExporters,
  onImportProgress,
  onExportProgress
};
