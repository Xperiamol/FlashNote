const { app, BrowserWindow, ipcMain, Tray, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');

// 使用用户数据目录存储设置和数据
const userDataPath = app.getPath('userData');
const notesFile = path.join(userDataPath, 'notes.json');
const settingsFile = path.join(userDataPath, 'settings.json');

console.log('用户数据目录:', userDataPath);
console.log('设置文件路径:', settingsFile);
console.log('笔记文件路径:', notesFile);

// 读取设置
function readSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, 'utf-8');
      console.log(`成功读取设置文件: ${settingsFile}`);
      const settings = JSON.parse(data);
      console.log('当前设置:', settings);
      return settings;
    } else {
      console.log(`设置文件不存在: ${settingsFile}，使用默认设置`);
    }
  } catch (error) {
    console.error('读取设置文件失败:', error);
  }
  // 默认设置
  const defaultSettings = { 
    alwaysOnTop: true, 
    openAtLogin: false, 
    restoreWindows: false,
    floatingBallPosition: null, // 悬浮球位置，null 表示使用默认位置
    customColors: {
      tabTextColor: '#000000',
      tabIndicatorColor: '#1890ff',
      inputBorderColor: '#1890ff',
      addButtonColor: '#1890ff',
      backgroundColor: '#f5f5f5',
      noteBackgroundColor: '#ffffff'
    },
    backgroundImage: '',
    backgroundBlur: 0,
    backgroundBrightness: 100,
    inputRadius: 25,
    blockRadius: 6
  };
  console.log('使用默认设置:', defaultSettings);
  return defaultSettings;
}

// 写入设置
function writeSettings(settings) {
  try {
    // 确保目录存在
    const settingsDir = path.dirname(settingsFile);
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    
    // 写入设置
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('成功写入设置:', settings);
    
    // 验证设置是否正确写入
    if (fs.existsSync(settingsFile)) {
      const verification = fs.readFileSync(settingsFile, 'utf-8');
      console.log('验证设置文件内容:', JSON.parse(verification));
    }
  } catch (error) {
    console.error('写入设置文件失败:', error);
  }
}

let mainWin = null;
let tray = null;
let floatingBallWin = null; // 悬浮球窗口

// 更新托盘菜单的函数
function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  
  const updatedContextMenu = Menu.buildFromTemplate([
    {
      label: '打开主程序',
      click: () => {
        showMainWindow();
      }
    },
    {
      type: 'separator'
    },
    {
      label: floatingBallWin && !floatingBallWin.isDestroyed() ? '隐藏悬浮球' : '显示悬浮球',
      click: () => {
        if (floatingBallWin && !floatingBallWin.isDestroyed()) {
          floatingBallWin.close();
          floatingBallWin = null;
        } else {
          createFloatingBall();
        }
        // 更新托盘菜单
        updateTrayMenu();
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(updatedContextMenu);
}

// 注册所有 IPC 处理程序
registerIpcHandlers();

function registerIpcHandlers() {
  // IPC: 设置窗口置顶
  ipcMain.on('set-always-on-top', (event, { id, value }) => {
    if (id === 'main' && mainWin) {
      mainWin.setAlwaysOnTop(!!value);
      const settings = readSettings();
      settings.alwaysOnTop = !!value;
      writeSettings(settings);
    } else if (id === 'settings') {
      // This is for settings from the settings page
    } else {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setAlwaysOnTop(!!value);

        // 获取小窗口对应的笔记数据并更新其置顶状态
        const url = win.webContents.getURL();
        const noteId = url.substring(url.lastIndexOf('/') + 1);

        let notes = [];
        if (fs.existsSync(notesFile)) {
            try {
                notes = JSON.parse(fs.readFileSync(notesFile, 'utf-8'));
            } catch (e) {
                notes = [];
            }
        }

        const noteIndex = notes.findIndex(n => n.id === noteId);
        if (noteIndex !== -1) {
            notes[noteIndex].alwaysOnTop = !!value;
            fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2), 'utf-8');
        }
      }
    }
  });

  // IPC: 设置开机自启
  ipcMain.on('set-open-at-login', (event, value) => {
    const settings = readSettings();
    settings.openAtLogin = !!value;
    writeSettings(settings);
    
    // 在开发环境中禁用开机自启设置
    if (!app.isPackaged) {
      console.warn('开发环境中不设置开机自启功能');
      event.reply('open-at-login-result', {
        success: false,
        message: '开发环境中不支持开机自启功能，请使用打包后的应用程序'
      });
      return;
    }
    
    // 使用更可靠的方式设置开机自启
    try {
      // 获取正确的可执行文件路径
      const executablePath = process.execPath;
      console.log(`设置开机自启，可执行文件路径: ${executablePath}`);
      
      // 标准 Electron 方法
      app.setLoginItemSettings({
        openAtLogin: settings.openAtLogin,
        path: executablePath,
        args: ['--hidden'] // 启动时隐藏主窗口
      });
      
      // Windows 环境下，额外使用注册表方法提高可靠性
      if (process.platform === 'win32') {
        setWindowsAutoStart(settings.openAtLogin);
      }
      
      console.log(`设置开机自启: ${settings.openAtLogin}, 路径: ${executablePath}`);
      event.reply('open-at-login-result', {
        success: true,
        message: `开机自启已${settings.openAtLogin ? '启用' : '禁用'}`
      });
    } catch (error) {
      console.error('设置开机自启时发生错误:', error);
      event.reply('open-at-login-result', {
        success: false,
        message: `设置开机自启失败: ${error.message}`
      });
    }
  });
  
// Windows 特定的开机自启设置函数
function setWindowsAutoStart(enable) {
  const appName = app.getName();
  
  // 获取正确的应用程序路径
  let appPath;
  if (app.isPackaged) {
    // 生产环境：使用打包后的可执行文件路径
    appPath = `"${process.execPath}"`;
  } else {
    // 开发环境：禁用开机自启功能，避免指向错误的路径
    console.warn('开发环境中不设置开机自启，避免指向 electron.exe');
    return;
  }
  
  const regPath = `reg add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run /v ${appName} /t REG_SZ /d ${appPath} /f`;
  const regDeletePath = `reg delete HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run /v ${appName} /f`;
  
  console.log(`设置Windows开机自启: ${enable}, 应用路径: ${appPath}`);
  
  if (enable) {
    // 添加到注册表
    execFile('cmd.exe', ['/c', regPath], (error) => {
      if (error) {
        console.error('添加开机启动项到注册表失败:', error);
      } else {
        console.log('已成功添加开机启动项到注册表');
      }
    });
  } else {
    // 从注册表删除
    execFile('cmd.exe', ['/c', regDeletePath], (error) => {
      if (error) {
        console.error('从注册表删除开机启动项失败:', error);
      } else {
        console.log('已成功从注册表删除开机启动项');
      }
    });
  }
}

  // IPC: 设置是否恢复窗口
  ipcMain.on('set-restore-windows', (event, value) => {
    const settings = readSettings();
    settings.restoreWindows = !!value;
    writeSettings(settings);
  });

  // IPC: 获取设置
  ipcMain.handle('get-settings', async () => {
    return readSettings();
  });

  // IPC: 保存悬浮球位置
  ipcMain.on('save-floating-ball-position', (event, position) => {
    const settings = readSettings();
    settings.floatingBallPosition = position;
    writeSettings(settings);
    console.log('保存悬浮球位置:', position);
  });

  // IPC: 获取悬浮球位置
  ipcMain.handle('get-floating-ball-position', async () => {
    const settings = readSettings();
    return settings.floatingBallPosition || null;
  });

  // IPC: 保存颜色设置
  ipcMain.on('save-custom-colors', (event, colors) => {
    console.log('收到保存颜色设置请求:', colors);
    const settings = readSettings();
    console.log('当前设置:', settings);
    settings.customColors = colors;
    writeSettings(settings);
    console.log('保存颜色设置完成:', colors);
  });

  // IPC: 保存圆角设置
  ipcMain.on('save-radius-settings', (event, { inputRadius, blockRadius }) => {
    console.log('收到保存圆角设置请求:', { inputRadius, blockRadius });
    const settings = readSettings();
    settings.inputRadius = inputRadius;
    settings.blockRadius = blockRadius;
    writeSettings(settings);
    console.log('保存圆角设置完成:', { inputRadius, blockRadius });
  });

  // IPC: 保存背景图片
  ipcMain.on('save-background-image', (event, imagePath) => {
    console.log('收到保存背景图片请求:', imagePath);
    const settings = readSettings();
    settings.backgroundImage = imagePath;
    writeSettings(settings);
    console.log('保存背景图片完成:', imagePath);
  });

  // IPC: 保存背景模糊度
  ipcMain.on('save-background-blur', (event, blurValue) => {
    console.log('收到保存背景模糊度请求:', blurValue);
    const settings = readSettings();
    settings.backgroundBlur = blurValue;
    writeSettings(settings);
    console.log('保存背景模糊度完成:', blurValue);
  });

  // IPC: 保存背景亮度
  ipcMain.on('save-background-brightness', (event, brightnessValue) => {
    console.log('收到保存背景亮度请求:', brightnessValue);
    const settings = readSettings();
    settings.backgroundBrightness = brightnessValue;
    writeSettings(settings);
    console.log('保存背景亮度完成:', brightnessValue);
  });

  // IPC: 最小化窗口
  ipcMain.on('minimize-window', () => {
    if (mainWin) {
      mainWin.minimize();
    }
  });

  // IPC: 获取窗口置顶状态
  ipcMain.handle('get-always-on-top', async (event, { id }) => {
    try {
      if (id === 'main' && mainWin) {
        return mainWin.isAlwaysOnTop();
      }
      return false;
    } catch (error) {
      console.error('Error in get-always-on-top handler:', error);
      return false;
    }
  });
  
  // 添加：处理打开笔记小窗口的事件
  ipcMain.on('open-note-window', (event, noteData) => {
    const settings = readSettings();
    // 创建新的小窗口
    const noteWindow = new BrowserWindow({
      width: 300,
      height: 200,
      frame: false,
      alwaysOnTop: noteData.alwaysOnTop || false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        spellcheck: false,

      },
    });
    
    noteWindow.on('close', () => {
      updateNoteFile({ ...noteData, isOpen: false });
    });

    // 加载相同的页面
    if (app.isPackaged) {
      noteWindow.loadFile(path.join(__dirname, 'renderer', 'build', 'index.html'), {
        hash: `note/${noteData.id}`
      });
    } else {
      noteWindow.loadURL(`http://localhost:3000/#note/${noteData.id}`);
    }
    
    // 将笔记数据保存到文件
    updateNoteFile({ ...noteData, isOpen: true });
  });
  function updateNoteFile(noteData) {
    let notes = [];
    if (fs.existsSync(notesFile)) {
      try {
        notes = JSON.parse(fs.readFileSync(notesFile, 'utf-8'));
      } catch (e) { notes = []; }
    }
    const idx = notes.findIndex(n => n.id === noteData.id);
    if (idx > -1) {
      notes[idx] = { ...notes[idx], ...noteData };
    } else {
      notes.push(noteData);
    }
    fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2), 'utf-8');
  }

  ipcMain.on('update-note', (event, noteData) => {
    updateNoteFile(noteData);
    // 通知主窗口刷新
    if (mainWin) {
      mainWin.webContents.send('refresh-notes');
    }
  });

  // 创建/显示悬浮球
  ipcMain.on('show-floating-ball', () => {
    if (floatingBallWin && !floatingBallWin.isDestroyed()) {
      floatingBallWin.show();
    } else {
      createFloatingBall();
    }
    // 更新托盘菜单
    if (tray && !tray.isDestroyed()) {
      updateTrayMenu();
    }
  });

  // 隐藏悬浮球
  ipcMain.on('hide-floating-ball', () => {
    if (floatingBallWin && !floatingBallWin.isDestroyed()) {
      floatingBallWin.close();
      floatingBallWin = null;
    }
    // 更新托盘菜单
    if (tray && !tray.isDestroyed()) {
      updateTrayMenu();
    }
  });

  // 显示主窗口
  ipcMain.on('show-main-window', () => {
    showMainWindow();
  });

  // 添加闪记
  ipcMain.on('add-note', (event, noteData) => {
    // 首先保存到文件
    updateNoteFile(noteData);
    
    // 判断事件来源是否为悬浮球
    const isFromFloatingBall = floatingBallWin && 
      event.sender.id === floatingBallWin.webContents.id;
    
    // 只有来自悬浮球的事件才需要直接发送到主窗口
    // 避免主窗口自己的添加操作被重复处理
    if (isFromFloatingBall && mainWin && !mainWin.isDestroyed()) {
      console.log('从悬浮球发送笔记到主窗口:', noteData);
      mainWin.webContents.send('add-note', noteData);
    } else if (!mainWin) {
      console.log('主窗口不存在，无法发送笔记');
    }
  });

  // 添加待办
  ipcMain.on('add-todo', (event, todoData) => {
    // 判断事件来源是否为悬浮球
    const isFromFloatingBall = floatingBallWin && 
      event.sender.id === floatingBallWin.webContents.id;
    
    // 只有来自悬浮球的事件才需要直接发送到主窗口
    // 避免主窗口自己的添加操作被重复处理
    if (isFromFloatingBall && mainWin && !mainWin.isDestroyed()) {
      console.log('从悬浮球发送待办事项到主窗口:', todoData);
      mainWin.webContents.send('add-todo', todoData);
    } else if (!mainWin) {
      console.log('主窗口不存在，无法发送待办事项');
    }
  });

  // 🔧 添加：控制悬浮球窗口的点击穿透
  ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
    if (floatingBallWin && !floatingBallWin.isDestroyed()) {
      floatingBallWin.setIgnoreMouseEvents(ignore, { forward: true });
      // 当需要交互时 (ignore=false)，窗口必须是可聚焦的才能接收键盘输入
      floatingBallWin.setFocusable(!ignore);
      console.log(`悬浮球点击穿透状态: ${ignore ? '启用' : '禁用'}, 可聚焦: ${!ignore}`);
    }
  });
}

function createWindow() {
  const settings = readSettings();

  mainWin = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    alwaysOnTop: settings.alwaysOnTop,
    transparent: true,
    backgroundColor: '#00000000',
    show: false, // 初始不显示，等待动画
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      spellcheck: false,

    }
  });

  // 页面加载完成后执行Windows风格的窗口动画
  mainWin.once('ready-to-show', () => {
    console.log('窗口准备显示, 平台:', process.platform, '开发环境:', !app.isPackaged);
    if (process.platform === 'win32') {
      // Windows环境下添加窗口动画
      console.log('执行Windows风格窗口动画');
      showWindowWithAnimation(mainWin);
    } else {
      // 其他平台直接显示
      console.log('非Windows平台，直接显示窗口');
      mainWin.show();
    }
  });

  if (app.isPackaged) {
    mainWin.loadFile(path.join(__dirname, 'renderer', 'build', 'index.html'));
  } else {
    mainWin.loadURL('http://localhost:3000');
  }
}

// Windows风格的窗口显示动画
function showWindowWithAnimation(window) {
  if (!window || window.isDestroyed()) return;
  
  console.log('开始执行窗口动画');
  
  // 如果窗口已经可见，不需要动画
  if (window.isVisible()) {
    console.log('窗口已可见，跳过动画');
    window.focus();
    return;
  }
  
  // 获取屏幕中心位置
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const originalBounds = { width: 400, height: 600 }; // 使用固定尺寸
  const centerX = Math.round((screenWidth - originalBounds.width) / 2);
  const centerY = Math.round((screenHeight - originalBounds.height) / 2);
  
  console.log(`屏幕尺寸: ${screenWidth}x${screenHeight}, 窗口居中位置: ${centerX}, ${centerY}`);
  
  // 设置初始状态
  window.setOpacity(0);
  window.setPosition(centerX, centerY);
  
  // 从稍小的尺寸开始
  const initialScale = 0.95;
  const initialWidth = Math.round(originalBounds.width * initialScale);
  const initialHeight = Math.round(originalBounds.height * initialScale);
  const initialX = centerX + Math.round((originalBounds.width - initialWidth) / 2);
  const initialY = centerY + Math.round((originalBounds.height - initialHeight) / 2);
  
  window.setBounds({
    x: initialX,
    y: initialY,
    width: initialWidth,
    height: initialHeight
  });
  
  console.log('设置初始窗口状态：透明度=0, 缩放=0.95');
  window.show();
  
  // 动画参数
  const animationDuration = 200; // 200毫秒
  const animationSteps = 20;
  const stepInterval = animationDuration / animationSteps;
  
  let currentStep = 0;
  
  console.log(`开始动画循环，总步数: ${animationSteps}, 间隔: ${stepInterval}ms`);
  
  const animationTimer = setInterval(() => {
    currentStep++;
    const progress = currentStep / animationSteps;
    
    // 使用缓入缓出效果
    const easedProgress = 0.5 - Math.cos(progress * Math.PI) / 2;
    
    // 计算当前透明度
    const currentOpacity = easedProgress;
    
    // 计算当前缩放
    const currentScale = initialScale + (1 - initialScale) * easedProgress;
    const currentWidth = Math.round(originalBounds.width * currentScale);
    const currentHeight = Math.round(originalBounds.height * currentScale);
    const currentX = centerX + Math.round((originalBounds.width - currentWidth) / 2);
    const currentY = centerY + Math.round((originalBounds.height - currentHeight) / 2);
    
    if (!window.isDestroyed()) {
      window.setOpacity(currentOpacity);
      window.setBounds({
        x: currentX,
        y: currentY,
        width: currentWidth,
        height: currentHeight
      });
    }
    
    if (currentStep >= animationSteps) {
      console.log('动画完成');
      clearInterval(animationTimer);
      // 确保最终状态正确
      if (!window.isDestroyed()) {
        window.setOpacity(1);
        window.setBounds({
          x: centerX,
          y: centerY,
          width: originalBounds.width,
          height: originalBounds.height
        });
        window.focus();
        console.log('窗口动画结束，最终状态：透明度=1, 缩放=1.0');
      }
    }
  }, stepInterval);
}

// 智能显示主窗口函数（包含动画）
function showMainWindow() {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isVisible()) {
      // 如果窗口已经可见，只需要聚焦
      mainWin.focus();
    } else {
      // 如果窗口存在但不可见，使用动画显示
      if (process.platform === 'win32') {
        showWindowWithAnimation(mainWin);
      } else {
        mainWin.show();
        mainWin.focus();
      }
    }
  } else {
    createWindow();
  }
}

// 在应用准备就绪时注册 IPC 处理程序并创建窗口
app.whenReady().then(() => {
  // 检查命令行参数，如果包含 --hidden 则不创建主窗口
  const shouldStartHidden = process.argv.includes('--hidden');
  console.log('应用启动参数:', process.argv);
  console.log('是否隐藏启动:', shouldStartHidden);
  
  if (!shouldStartHidden) {
    createWindow();
  } else {
    console.log('隐藏启动模式，不创建主窗口');
  }

  const iconPath = path.join(__dirname, 'renderer', 'public', 'favicon.ico');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开主程序',
      click: () => {
        showMainWindow();
      }
    },
    {
      type: 'separator'
    },
    {
      label: floatingBallWin && !floatingBallWin.isDestroyed() ? '隐藏悬浮球' : '显示悬浮球',
      click: () => {
        if (floatingBallWin && !floatingBallWin.isDestroyed()) {
          floatingBallWin.close();
          floatingBallWin = null;
        } else {
          createFloatingBall();
        }
        // 更新托盘菜单
        updateTrayMenu();
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Note App');
  tray.setContextMenu(contextMenu);

  const settings = readSettings();

  // 根据设置初始化开机自启（仅在生产环境）
  if (app.isPackaged) {
    try {
      const executablePath = process.execPath;
      console.log(`初始化开机自启，可执行文件路径: ${executablePath}`);
      
      app.setLoginItemSettings({
        openAtLogin: settings.openAtLogin,
        path: executablePath,
        args: ['--hidden'] // 启动时隐藏主窗口
      });
      
      // Windows 环境下，额外使用注册表方法提高可靠性
      if (process.platform === 'win32' && settings.openAtLogin) {
        setWindowsAutoStart(settings.openAtLogin);
      }
      
      console.log(`初始化开机自启: ${settings.openAtLogin}, 路径: ${executablePath}`);
    } catch (error) {
      console.error('初始化开机自启时发生错误:', error);
    }
  } else {
    console.log('开发环境中跳过开机自启初始化');
  }

  // 根据设置恢复独立窗口
  if (settings.restoreWindows) {
    let notes = [];
    if (fs.existsSync(notesFile)) {
      try {
        notes = JSON.parse(fs.readFileSync(notesFile, 'utf-8'));
      } catch (e) {
        notes = [];
      }
    }
    notes.forEach(note => {
      if (note.isOpen) { // 假设笔记对象有一个isOpen属性
        ipcMain.emit('open-note-window', null, note);
      }
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 创建悬浮球窗口函数
function createFloatingBall() {
  // 获取屏幕尺寸
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // 创建一个全屏透明的悬浮球窗口
  floatingBallWin = new BrowserWindow({
    width: width,
    height: height,
    frame: false,
    show: true,
    skipTaskbar: true,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    type: 'toolbar',
    backgroundColor: '#00000000', // 明确设置背景色为完全透明
    hasShadow: false, // 禁用窗口阴影，可以提高透明效果
    // 🔧 添加这些关键属性来解决点击穿透问题
    thickFrame: false,        // 禁用厚边框
    roundedCorners: false,    // 禁用圆角
    focusable: false,         // 窗口不可获得焦点，避免抢夺其他应用的焦点
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // 禁用 contextIsolation 以便于直接访问 ipcRenderer
      enableRemoteModule: true,
      spellcheck: false,
    }
  });

  // 将窗口定位在屏幕左上角，覆盖整个屏幕
  floatingBallWin.setPosition(0, 0);
  
  // 🔧 关键修复：设置窗口忽略鼠标事件，实现点击穿透
  floatingBallWin.setIgnoreMouseEvents(true, { forward: true });
  
  console.log('创建悬浮球窗口');
  console.log(`屏幕尺寸: ${width}x${height}`);
  console.log(`悬浮球位置: ${width - 100}, ${height - 100}`);
  
  // 确保窗口视觉属性设置正确
  floatingBallWin.setBackgroundColor('#00000000');
  
  // 加载悬浮球的 URL
  if (app.isPackaged) {
    floatingBallWin.loadFile(path.join(__dirname, 'renderer', 'build', 'index.html'), {
      hash: 'floatingball'
    });
  } else {
    floatingBallWin.loadURL('http://localhost:3000/#floatingball');
    console.log('加载悬浮球URL:', 'http://localhost:3000/#floatingball');
  }

  // 当页面加载完成时
  floatingBallWin.webContents.on('did-finish-load', () => {
    console.log('悬浮球窗口加载完成');
    
    // 注入CSS确保背景透明
    floatingBallWin.webContents.insertCSS(`
      html, body, #root {
        background: transparent !important;
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
      .floating-ball-container {
        background: transparent !important;
        width: 100%;
        height: 100%;
      }
    `).catch(err => console.error('插入CSS失败:', err));
  });

  // 开发环境下打开开发者工具
  if (!app.isPackaged) {
    floatingBallWin.webContents.openDevTools({ mode: 'detach' });
  }

  // 当悬浮球窗口关闭时的处理
  floatingBallWin.on('closed', () => {
    floatingBallWin = null;
    // 更新托盘菜单，反映悬浮球状态变化
    if (tray && !tray.isDestroyed()) {
      updateTrayMenu();
    }
  });

  // 创建完成后更新托盘菜单
  if (tray && !tray.isDestroyed()) {
    updateTrayMenu();
  }
}

