/**
 * 测试插件扩展点架构
 * 验证：
 * 1. 插件安装后按钮出现在 TagInput
 * 2. 插件卸载后按钮自动消失
 * 3. 多个插件可以同时扩展 tag-input
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron', 'preload.js')
    }
  });

  // 加载应用
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile('index.html');
  }
}

app.whenReady().then(() => {
  createWindow();
  
  console.log('\n=== 插件扩展点架构测试指南 ===\n');
  console.log('1. 打开笔记编辑器，查看标签输入框');
  console.log('2. 如果 auto-tag-creator 已安装，应该看到 AI 按钮');
  console.log('3. 点击 AI 按钮，应该生成标签');
  console.log('4. 卸载 auto-tag-creator 插件');
  console.log('5. AI 按钮应该自动消失');
  console.log('6. 重新安装插件，按钮应该重新出现');
  console.log('\n=================================\n');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
