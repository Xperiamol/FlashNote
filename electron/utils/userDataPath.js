const path = require('path');

// Electron 的目录可能由启动参数重定向；每次调用读取，不能在模块加载时缓存。
// 普通 Node / MCP 运行时保留既有的各平台 Flota 目录。
const getUserDataPath = () => {
  let app;
  try {
    app = require('electron').app;
  } catch (_) {
    // Standalone Node 没有 Electron。
  }
  if (app) return app.getPath('userData');
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (process.platform === 'win32') return path.join(process.env.APPDATA || homeDir, 'Flota');
  if (process.platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support', 'Flota');
  return path.join(homeDir, '.config', 'Flota');
};

module.exports = { getUserDataPath };
