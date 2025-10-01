/**
 * 云同步相关的API
 */

import { invoke } from './ipc';

/**
 * 获取可用的同步服务列表
 */
export const getAvailableServices = async () => {
  return await invoke('sync:get-available-services');
};

/**
 * 获取当前同步状态
 */
export const getSyncStatus = async () => {
  return await invoke('sync:get-status');
};

/**
 * 测试同步服务连接
 */
export const testConnection = async (serviceName, config) => {
  return await invoke('sync:test-connection', serviceName, config);
};

/**
 * 切换到指定的同步服务
 */
export const switchService = async (serviceName, config) => {
  return await invoke('sync:switch-service', serviceName, config);
};

/**
 * 禁用云同步
 */
export const disableSync = async () => {
  return await invoke('sync:disable');
};

/**
 * 手动触发同步
 */
export const manualSync = async () => {
  return await invoke('sync:manual-sync');
};

/**
 * 强制停止同步
 */
export const forceStopSync = async () => {
  return await invoke('sync:force-stop');
};

/**
 * 获取冲突列表
 */
export const getConflicts = async () => {
  return await invoke('sync:get-conflicts');
};

/**
 * 解决冲突
 */
export const resolveConflict = async (conflictId, resolution) => {
  return await invoke('sync:resolve-conflict', conflictId, resolution);
};

/**
 * 导出数据到文件
 */
export const exportData = async (filePath) => {
  return await invoke('sync:export-data', filePath);
};

/**
 * 从文件导入数据
 */
export const importData = async (filePath) => {
  return await invoke('sync:import-data', filePath);
};