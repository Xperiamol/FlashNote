const { ipcMain } = require('electron');

/**
 * MCP 相关 IPC 处理器
 */
function setupMCPHandlers(mcpDownloader, mainWindow) {
  // 检查 MCP Server 是否已安装
  ipcMain.handle('mcp:isInstalled', async () => {
    try {
      const installed = await mcpDownloader.isInstalled();
      return { success: true, data: installed };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 获取 MCP Server 安装信息
  ipcMain.handle('mcp:getInstallInfo', async () => {
    try {
      const info = await mcpDownloader.getInstallInfo();
      return { success: true, data: info };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 下载并安装 MCP Server
  ipcMain.handle('mcp:install', async () => {
    try {
      // 检查是否已安装
      const installed = await mcpDownloader.isInstalled();
      if (installed) {
        return { success: false, error: 'MCP Server 已安装' };
      }

      // 显示下载对话框
      const shouldDownload = await mcpDownloader.showDownloadDialog(mainWindow);
      if (!shouldDownload) {
        return { success: false, error: '用户取消下载' };
      }

      // 监听进度事件并转发给渲染进程
      const progressListener = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('mcp:install-progress', data);
        }
      };

      const retryListener = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('mcp:download-retry', data);
        }
      };

      mcpDownloader.on('download-progress', progressListener);
      mcpDownloader.on('download-retry', retryListener);
      mcpDownloader.on('extract-start', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('mcp:install-progress', { 
            percent: 90, 
            status: 'extracting' 
          });
        }
      });

      try {
        // 开始下载
        await mcpDownloader.download();
        return { success: true, data: { message: 'MCP Server 安装成功' } };
      } finally {
        // 清理监听器
        mcpDownloader.removeListener('download-progress', progressListener);
        mcpDownloader.removeListener('download-retry', retryListener);
      }
    } catch (error) {
      console.error('[MCP Install] 安装失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 卸载 MCP Server
  ipcMain.handle('mcp:uninstall', async () => {
    try {
      await mcpDownloader.uninstall();
      return { success: true, data: { message: 'MCP Server 已卸载' } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 获取 MCP Server 配置路径
  ipcMain.handle('mcp:getConfigPath', async () => {
    try {
      const installed = await mcpDownloader.isInstalled();
      if (!installed) {
        return { success: false, error: 'MCP Server 未安装' };
      }

      const launcherPath = mcpDownloader.getLauncherPath();
      return { success: true, data: { launcherPath } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 清理临时文件
  ipcMain.handle('mcp:cleanTemp', async () => {
    try {
      await mcpDownloader.cleanTempFiles();
      return { success: true, data: { message: '临时文件已清理' } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupMCPHandlers };
