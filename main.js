const { app, BrowserWindow, ipcMain, Tray, Menu, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');

// 使用用户数据目录存储设置和数据
const userDataPath = app.getPath('userData');
const notesFile = path.join(userDataPath, 'notes.json');
const todosFile = path.join(userDataPath, 'todos.json');
const settingsFile = path.join(userDataPath, 'settings.json');

console.log('用户数据目录:', userDataPath);
console.log('设置文件路径:', settingsFile);
console.log('笔记文件路径:', notesFile);
console.log('待办文件路径:', todosFile);

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
    blockRadius: 6,
    floatingBallSettings: {
      // 外观设置
      size: 50, // 悬浮球大小
      idleOpacity: 0.7, // 闲置状态透明度
      activeOpacity: 0.9, // 激活状态透明度
      brightnessChange: 0.2, // 激活时亮度变化量 (-1 到 1, 负数变暗，正数变亮)
      flashColor: '#1890ff', // 闪记模式颜色
      todoColor: '#52c41a', // Todo模式颜色
      customIcon: '', // 自定义图标路径
      useCustomIcon: false // 是否使用自定义图标
    },
    todoSettings: {
      autoSort: true, // 自动排序开关
      sortBy: 'priority' // 排序方式: 'priority'(优先级), 'deadline'(截止日期), 'created'(创建时间)
    }
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
  if (!tray || tray.isDestroyed()) {
    console.log('托盘不存在或已销毁，跳过菜单更新');
    return;
  }
  
  const updatedContextMenu = Menu.buildFromTemplate([
    {
      label: '打开主程序',
      click: () => {
        console.log('托盘菜单：打开主程序被点击');
        try {
          showMainWindow();
        } catch (error) {
          console.error('打开主程序时出错:', error);
          // 如果出错，尝试创建新窗口
          try {
            createWindow();
          } catch (createError) {
            console.error('创建新窗口也失败:', createError);
          }
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: floatingBallWin && !floatingBallWin.isDestroyed() ? '隐藏悬浮球' : '显示悬浮球',
      click: () => {
        console.log('托盘菜单：悬浮球切换被点击');
        try {
          if (floatingBallWin && !floatingBallWin.isDestroyed()) {
            floatingBallWin.close();
            floatingBallWin = null;
          } else {
            createFloatingBall();
          }
          // 更新托盘菜单
          updateTrayMenu();
        } catch (error) {
          console.error('切换悬浮球时出错:', error);
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        console.log('托盘菜单：退出被点击');
        try {
          // 强制退出应用，确保所有窗口和进程都被关闭
          forceQuitApplication();
        } catch (error) {
          console.error('退出应用时出错:', error);
          // 如果正常退出失败，使用强制退出
          process.exit(0);
        }
      }
    }
  ]);
  
  try {
    tray.setContextMenu(updatedContextMenu);
    console.log('托盘菜单更新成功');
  } catch (error) {
    console.error('设置托盘菜单时出错:', error);
  }
}

// 强制退出应用程序
function forceQuitApplication() {
  console.log('开始强制退出应用程序...');
  
  try {
    // 1. 关闭所有窗口（包括笔记小窗口）
    const allWindows = BrowserWindow.getAllWindows();
    console.log(`发现 ${allWindows.length} 个窗口，正在关闭...`);
    
    allWindows.forEach((window, index) => {
      try {
        if (!window.isDestroyed()) {
          console.log(`关闭窗口 ${index + 1}:`, window.getTitle() || '未知窗口');
          // 移除所有事件监听器，防止 close 事件被阻止
          window.removeAllListeners('close');
          window.destroy(); // 使用 destroy() 而不是 close() 确保强制关闭
        }
      } catch (error) {
        console.error(`关闭窗口 ${index + 1} 时出错:`, error);
      }
    });
    
    // 2. 清理全局窗口引用
    mainWin = null;
    floatingBallWin = null;
    
    // 3. 销毁托盘
    if (tray && !tray.isDestroyed()) {
      console.log('销毁托盘图标...');
      tray.destroy();
      tray = null;
    }
    
    // 4. 清理IPC监听器
    ipcMain.removeAllListeners();
    console.log('清理所有IPC监听器');
    
    console.log('所有资源清理完成，退出应用');
    
    // 5. 退出应用
    app.quit();
    
    // 6. 如果 app.quit() 在2秒内没有生效，强制退出进程
    setTimeout(() => {
      console.log('应用退出超时，强制终止进程');
      process.exit(0);
    }, 2000);
    
  } catch (error) {
    console.error('强制退出过程中出错:', error);
    // 最后的保险措施：直接终止进程
    process.exit(1);
  }
}

// 防止多实例运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('应用已经在运行，退出新实例');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('检测到第二个实例启动，显示现有窗口');
    console.log('当前主窗口状态:', mainWin ? '存在' : '不存在');
    
    // 当运行第二个实例时，将主窗口置于顶层并聚焦
    if (mainWin && !mainWin.isDestroyed()) {
      try {
        console.log('主窗口存在且未销毁，尝试显示');
        if (mainWin.isMinimized()) {
          console.log('主窗口已最小化，正在恢复');
          mainWin.restore();
        }
        if (!mainWin.isVisible()) {
          console.log('主窗口不可见，使用动画显示');
          showMainWindow();
        } else {
          console.log('主窗口可见，聚焦到前台');
          mainWin.focus();
          mainWin.show(); // 确保窗口显示在前台
        }
      } catch (error) {
        console.error('操作主窗口时出错:', error);
        // 如果操作现有窗口失败，创建新窗口
        mainWin = null;
        createWindow();
      }
    } else {
      console.log('主窗口不存在或已销毁，创建新窗口');
      // 如果主窗口不存在或已销毁，创建一个新的
      createWindow();
    }
  });
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

  // IPC: 保存悬浮球设置
  ipcMain.on('save-floating-ball-settings', (event, floatingBallSettings) => {
    console.log('收到保存悬浮球设置请求:', floatingBallSettings);
    const settings = readSettings();
    settings.floatingBallSettings = floatingBallSettings;
    writeSettings(settings);
    console.log('保存悬浮球设置完成:', floatingBallSettings);
    
    // 通知悬浮球窗口更新设置
    if (floatingBallWin && !floatingBallWin.isDestroyed()) {
      floatingBallWin.webContents.send('floating-ball-settings-updated', floatingBallSettings);
    }
  });

  // IPC: 保存Todo设置
  ipcMain.on('save-todo-settings', (event, todoSettings) => {
    console.log('收到保存Todo设置请求:', todoSettings);
    const settings = readSettings();
    settings.todoSettings = todoSettings;
    writeSettings(settings);
    console.log('保存Todo设置完成:', todoSettings);
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
  // 笔记文件操作函数
  function readNotes() {
    let notes = [];
    if (fs.existsSync(notesFile)) {
      try {
        notes = JSON.parse(fs.readFileSync(notesFile, 'utf-8'));
        console.log('成功读取笔记文件，共', notes.length, '条笔记');
      } catch (e) { 
        console.error('读取笔记文件失败:', e);
        notes = []; 
      }
    } else {
      console.log('笔记文件不存在，创建空数组');
    }
    return notes;
  }

  function writeNotes(notes) {
    try {
      // 确保目录存在
      const notesDir = path.dirname(notesFile);
      if (!fs.existsSync(notesDir)) {
        fs.mkdirSync(notesDir, { recursive: true });
      }
      
      fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2), 'utf-8');
      console.log('成功保存笔记文件，共', notes.length, '条笔记');
    } catch (e) {
      console.error('写入笔记文件失败:', e);
    }
  }

  // Todo文件操作函数
  function readTodos() {
    let todos = [];
    if (fs.existsSync(todosFile)) {
      try {
        todos = JSON.parse(fs.readFileSync(todosFile, 'utf-8'));
        console.log('成功读取待办文件，共', todos.length, '条待办');
      } catch (e) { 
        console.error('读取待办文件失败:', e);
        todos = []; 
      }
    } else {
      console.log('待办文件不存在，创建空数组');
    }
    return todos;
  }

  function writeTodos(todos) {
    try {
      // 确保目录存在
      const todosDir = path.dirname(todosFile);
      if (!fs.existsSync(todosDir)) {
        fs.mkdirSync(todosDir, { recursive: true });
      }
      
      fs.writeFileSync(todosFile, JSON.stringify(todos, null, 2), 'utf-8');
      console.log('成功保存待办文件，共', todos.length, '条待办');
    } catch (e) {
      console.error('写入待办文件失败:', e);
    }
  }

  function updateNoteFile(noteData) {
    let notes = readNotes();
    const idx = notes.findIndex(n => n.id === noteData.id);
    if (idx > -1) {
      notes[idx] = { ...notes[idx], ...noteData };
    } else {
      notes.push(noteData);
    }
    writeNotes(notes);
  }

  // IPC: 笔记管理功能
  ipcMain.handle('get-notes', async () => {
    console.log('收到获取笔记请求');
    const notes = readNotes();
    console.log('返回笔记数据:', notes.length, '条');
    return notes;
  });

  ipcMain.handle('save-notes', async (event, notes) => {
    console.log('收到保存笔记请求，共', notes.length, '条笔记');
    writeNotes(notes);
    return true;
  });

  ipcMain.handle('add-note', async (event, noteData) => {
    console.log('收到添加笔记请求:', noteData);
    let notes = readNotes();
    
    // 确保笔记有唯一ID
    if (!noteData.id) {
      noteData.id = Date.now().toString();
    }
    
    // 检查是否已存在相同ID的笔记，避免重复添加
    const existingIndex = notes.findIndex(n => n.id === noteData.id);
    if (existingIndex !== -1) {
      console.log('笔记已存在，更新而不是添加');
      notes[existingIndex] = { ...notes[existingIndex], ...noteData };
    } else {
      notes.unshift(noteData); // 添加到开头
    }
    
    writeNotes(notes);
    
    // 通知主窗口刷新
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('refresh-notes');
    }
    
    return noteData;
  });

  ipcMain.handle('update-note', async (event, noteData) => {
    console.log('收到更新笔记请求:', noteData);
    let notes = readNotes();
    const idx = notes.findIndex(n => n.id === noteData.id);
    
    if (idx > -1) {
      notes[idx] = { ...notes[idx], ...noteData };
      writeNotes(notes);
      
      // 通知主窗口刷新
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('refresh-notes');
      }
      
      return true;
    }
    return false;
  });

  // 添加：获取单个笔记的处理器
  ipcMain.handle('get-note-by-id', async (event, noteId) => {
    console.log('收到获取笔记请求:', noteId);
    try {
      const notes = readNotes();
      const note = notes.find(n => n.id.toString() === noteId.toString());
      console.log('找到笔记:', note ? '是' : '否');
      return note || null;
    } catch (error) {
      console.error('获取笔记失败:', error);
      return null;
    }
  });

  ipcMain.handle('delete-note', async (event, noteId) => {
    console.log('收到删除笔记请求:', noteId);
    let notes = readNotes();
    const originalLength = notes.length;
    notes = notes.filter(n => n.id !== noteId);
    
    if (notes.length < originalLength) {
      writeNotes(notes);
      
      // 通知主窗口刷新
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('refresh-notes');
      }
      
      return true;
    }
    return false;
  });

  // IPC: Todo管理功能
  ipcMain.handle('get-todos', async () => {
    console.log('收到获取待办请求');
    const todos = readTodos();
    console.log('返回待办数据:', todos.length, '条');
    return todos;
  });

  ipcMain.handle('save-todos', async (event, todos) => {
    console.log('收到保存待办请求，共', todos.length, '条待办');
    writeTodos(todos);
    return true;
  });

  ipcMain.handle('add-todo', async (event, todoData) => {
    console.log('收到添加待办请求:', todoData);
    let todos = readTodos();
    
    // 确保待办有唯一ID
    if (!todoData.id) {
      todoData.id = Date.now();
    }
    
    // 检查是否已存在相同ID的待办，避免重复添加
    const existingIndex = todos.findIndex(t => t.id === todoData.id);
    if (existingIndex !== -1) {
      console.log('待办已存在，更新而不是添加');
      todos[existingIndex] = { ...todos[existingIndex], ...todoData };
    } else {
      todos.unshift(todoData); // 添加到开头
    }
    
    writeTodos(todos);
    
    // 通知主窗口刷新
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('refresh-todos');
    }
    
    return todoData;
  });

  ipcMain.handle('update-todo', async (event, todoData) => {
    console.log('收到更新待办请求:', todoData);
    let todos = readTodos();
    const idx = todos.findIndex(t => t.id === todoData.id);
    
    if (idx > -1) {
      todos[idx] = { ...todos[idx], ...todoData };
      writeTodos(todos);
      
      // 通知主窗口刷新
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('refresh-todos');
      }
      
      return true;
    }
    return false;
  });

  ipcMain.handle('delete-todo', async (event, todoId) => {
    console.log('收到删除待办请求:', todoId);
    let todos = readTodos();
    const originalLength = todos.length;
    todos = todos.filter(t => t.id !== todoId);
    
    if (todos.length < originalLength) {
      writeTodos(todos);
      
      // 通知主窗口刷新
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('refresh-todos');
      }
      
      return true;
    }
    return false;
  });

  ipcMain.on('update-note-legacy', (event, noteData) => {
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
  ipcMain.on('add-todo', async (event, todoData) => {
    // 判断事件来源是否为悬浮球
    const isFromFloatingBall = floatingBallWin && 
      event.sender.id === floatingBallWin.webContents.id;
    
    // 只有来自悬浮球的事件才需要直接发送到主窗口
    // 避免主窗口自己的添加操作被重复处理
    if (isFromFloatingBall) {
      console.log('从悬浮球添加待办事项:', todoData);
      
      // 使用新的IPC方法添加到文件
      try {
        let todos = readTodos();
        
        // 确保待办有唯一ID
        if (!todoData.id) {
          todoData.id = Date.now();
        }
        
        // 检查是否已存在相同ID的待办，避免重复添加
        const existingIndex = todos.findIndex(t => t.id === todoData.id);
        if (existingIndex !== -1) {
          console.log('待办已存在，更新而不是添加');
          todos[existingIndex] = { ...todos[existingIndex], ...todoData };
        } else {
          todos.unshift(todoData); // 添加到开头
        }
        
        writeTodos(todos);
        
        // 通知主窗口刷新
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('refresh-todos');
        }
      } catch (error) {
        console.error('添加待办失败:', error);
      }
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

  // 导出数据功能
  ipcMain.handle('export-data', async (event) => {
    try {
      const result = await dialog.showSaveDialog(mainWin, {
        title: '导出笔记和待办数据',
        defaultPath: `FlashNote_导出_${new Date().toISOString().slice(0, 10)}.json`,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (result.canceled) {
        return { success: false, message: '用户取消导出' };
      }

      // 读取笔记和待办数据
      const notes = readNotes();
      const todos = readTodos();
      const settings = readSettings();

      // 构建导出数据
      const exportData = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        appVersion: '1.3.2-release',
        data: {
          notes: notes,
          todos: todos,
          settings: {
            // 只导出安全的设置项，不包含系统相关的设置
            customColors: settings.customColors,
            backgroundImage: settings.backgroundImage,
            backgroundBlur: settings.backgroundBlur,
            backgroundBrightness: settings.backgroundBrightness,
            inputRadius: settings.inputRadius,
            blockRadius: settings.blockRadius,
            floatingBallSettings: settings.floatingBallSettings
          }
        }
      };

      // 写入文件
      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8');
      
      console.log('数据导出成功:', result.filePath);
      return { 
        success: true, 
        message: `数据已成功导出到: ${result.filePath}`,
        path: result.filePath,
        count: {
          notes: notes.length,
          todos: todos.length
        }
      };

    } catch (error) {
      console.error('导出数据失败:', error);
      return { 
        success: false, 
        message: `导出失败: ${error.message}` 
      };
    }
  });

  // 导入数据功能
  ipcMain.handle('import-data', async (event) => {
    try {
      const result = await dialog.showOpenDialog(mainWin, {
        title: '选择要导入的数据文件',
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '用户取消导入' };
      }

      const filePath = result.filePaths[0];
      
      // 读取文件内容
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const importData = JSON.parse(fileContent);

      // 验证数据格式
      if (!importData.data) {
        return { success: false, message: '无效的数据文件格式' };
      }

      let importCount = { notes: 0, todos: 0 };

      // 导入笔记数据
      if (importData.data.notes && Array.isArray(importData.data.notes)) {
        const currentNotes = readNotes();
        const importNotes = importData.data.notes;
        
        // 合并数据，避免重复（基于ID）
        const existingIds = new Set(currentNotes.map(note => note.id));
        const newNotes = importNotes.filter(note => !existingIds.has(note.id));
        
        if (newNotes.length > 0) {
          const mergedNotes = [...currentNotes, ...newNotes];
          writeNotes(mergedNotes);
          importCount.notes = newNotes.length;
        }
      }

      // 导入待办数据
      if (importData.data.todos && Array.isArray(importData.data.todos)) {
        const currentTodos = readTodos();
        const importTodos = importData.data.todos;
        
        // 合并数据，避免重复（基于ID）
        const existingIds = new Set(currentTodos.map(todo => todo.id));
        const newTodos = importTodos.filter(todo => !existingIds.has(todo.id));
        
        if (newTodos.length > 0) {
          const mergedTodos = [...currentTodos, ...newTodos];
          writeTodos(mergedTodos);
          importCount.todos = newTodos.length;
        }
      }

      // 导入设置（可选）
      if (importData.data.settings) {
        const currentSettings = readSettings();
        const importSettings = importData.data.settings;
        
        // 只导入安全的设置项
        const safeSettings = {
          ...currentSettings,
          customColors: importSettings.customColors || currentSettings.customColors,
          backgroundImage: importSettings.backgroundImage || currentSettings.backgroundImage,
          backgroundBlur: importSettings.backgroundBlur || currentSettings.backgroundBlur,
          backgroundBrightness: importSettings.backgroundBrightness || currentSettings.backgroundBrightness,
          inputRadius: importSettings.inputRadius || currentSettings.inputRadius,
          blockRadius: importSettings.blockRadius || currentSettings.blockRadius,
          floatingBallSettings: importSettings.floatingBallSettings || currentSettings.floatingBallSettings
        };
        
        writeSettings(safeSettings);
      }

      // 通知主窗口刷新数据
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('refresh-notes');
        mainWin.webContents.send('refresh-todos');
      }

      console.log('数据导入成功:', importCount);
      return { 
        success: true, 
        message: `数据导入成功！新增 ${importCount.notes} 条笔记，${importCount.todos} 条待办`,
        count: importCount
      };

    } catch (error) {
      console.error('导入数据失败:', error);
      return { 
        success: false, 
        message: `导入失败: ${error.message}` 
      };
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

  // 处理窗口关闭按钮点击（防止应用完全退出）
  mainWin.on('close', (event) => {
    console.log('主窗口关闭事件触发');
    if (process.platform !== 'darwin') {
      // 在非macOS平台上，关闭窗口时隐藏到托盘而不是退出应用
      event.preventDefault();
      try {
        mainWin.hide();
        console.log('主窗口已隐藏到托盘');
      } catch (error) {
        console.error('隐藏主窗口时出错:', error);
      }
    }
  });

  // 添加窗口关闭事件监听器（只有在真正销毁时才会触发）
  mainWin.on('closed', () => {
    console.log('主窗口已销毁，清理窗口引用');
    mainWin = null;
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
  console.log('showMainWindow被调用，当前主窗口状态:', mainWin ? (mainWin.isDestroyed() ? '已销毁' : '存在') : '不存在');
  
  try {
    if (mainWin && !mainWin.isDestroyed()) {
      console.log('主窗口存在且未销毁');
      if (mainWin.isVisible()) {
        console.log('窗口可见，聚焦到前台');
        // 如果窗口已经可见，只需要聚焦
        mainWin.focus();
        mainWin.show(); // 确保窗口在最前面
      } else {
        console.log('窗口不可见，显示窗口');
        // 如果窗口存在但不可见，使用动画显示
        if (process.platform === 'win32') {
          showWindowWithAnimation(mainWin);
        } else {
          mainWin.show();
          mainWin.focus();
        }
      }
    } else {
      console.log('主窗口不存在或已销毁，创建新窗口');
      createWindow();
    }
  } catch (error) {
    console.error('showMainWindow执行时出错:', error);
    // 如果出现错误，重置窗口引用并创建新窗口
    mainWin = null;
    try {
      createWindow();
    } catch (createError) {
      console.error('创建新窗口也失败:', createError);
    }
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

  // 创建托盘图标
  let iconPath;
  if (app.isPackaged) {
    // 生产环境：从打包后的资源目录获取图标
    iconPath = path.join(process.resourcesPath, 'app', 'renderer', 'public', 'favicon.ico');
    // 如果上述路径不存在，尝试备用路径
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, 'renderer', 'public', 'favicon.ico');
    }
    // 如果仍然不存在，使用应用图标
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(process.resourcesPath, 'app.ico');
    }
  } else {
    // 开发环境
    iconPath = path.join(__dirname, 'renderer', 'public', 'favicon.ico');
  }

  console.log('托盘图标路径:', iconPath);
  console.log('图标文件是否存在:', fs.existsSync(iconPath));

  try {
    tray = new Tray(iconPath);
    console.log('托盘创建成功');
  } catch (error) {
    console.error('创建托盘失败:', error);
    // 如果创建失败，尝试使用系统默认图标
    try {
      // 在Windows上创建一个简单的白色正方形作为备用图标
      const nativeImage = require('electron').nativeImage;
      const image = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAEklEQVR42u3BAQ0AAADCoPdPbQ8HFAABw8TJmwAAAABJRU5ErkJggg==');
      tray = new Tray(image);
      console.log('使用备用图标创建托盘成功');
    } catch (fallbackError) {
      console.error('创建备用托盘也失败:', fallbackError);
      return; // 如果托盘创建完全失败，就不设置托盘功能
    }
  }

  // 设置托盘提示和双击事件
  tray.setToolTip('闪念速记');
  
  // 添加托盘双击事件监听
  tray.on('double-click', () => {
    console.log('托盘图标被双击');
    try {
      showMainWindow();
    } catch (error) {
      console.error('双击托盘图标时出错:', error);
      try {
        createWindow();
      } catch (createError) {
        console.error('创建新窗口也失败:', createError);
      }
    }
  });

  // 添加托盘左键单击事件（Windows上需要特殊处理）
  if (process.platform === 'win32') {
    tray.on('click', () => {
      console.log('托盘图标被单击');
      try {
        showMainWindow();
      } catch (error) {
        console.error('单击托盘图标时出错:', error);
        try {
          createWindow();
        } catch (createError) {
          console.error('创建新窗口也失败:', createError);
        }
      }
    });
  }

  // 初始化托盘菜单
  const initialContextMenu = Menu.buildFromTemplate([
    {
      label: '打开主程序',
      click: () => {
        console.log('托盘菜单：打开主程序被点击');
        showMainWindow();
      }
    },
    {
      type: 'separator'
    },
    {
      label: '显示悬浮球',
      click: () => {
        console.log('托盘菜单：显示悬浮球被点击');
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
        console.log('托盘菜单：退出被点击');
        try {
          // 强制退出应用，确保所有窗口和进程都被关闭
          forceQuitApplication();
        } catch (error) {
          console.error('退出应用时出错:', error);
          // 如果正常退出失败，使用强制退出
          process.exit(0);
        }
      }
    }
  ]);

  // 设置初始上下文菜单
  tray.setContextMenu(initialContextMenu);
  console.log('托盘菜单设置完成');

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
  // 在Windows和Linux上，当所有窗口关闭时保持应用运行（托盘模式）
  // 在macOS上，通常应用会完全退出
  if (process.platform === 'darwin') {
    app.quit();
  }
  // 在其他平台上不退出，因为我们有托盘图标
});

app.on('activate', () => {
  // 在macOS上，当应用被激活时重新创建窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 添加应用退出前的清理
app.on('before-quit', (event) => {
  console.log('应用准备退出，进行清理...');
  
  try {
    // 关闭所有窗口（包括笔记小窗口）
    const allWindows = BrowserWindow.getAllWindows();
    console.log(`清理 ${allWindows.length} 个窗口`);
    
    allWindows.forEach((window, index) => {
      try {
        if (!window.isDestroyed()) {
          console.log(`清理窗口 ${index + 1}`);
          // 移除事件监听器，防止阻止退出
          window.removeAllListeners('close');
          window.destroy();
        }
      } catch (error) {
        console.error(`清理窗口 ${index + 1} 时出错:`, error);
      }
    });
    
    // 清理全局引用
    mainWin = null;
    floatingBallWin = null;
    
    // 销毁托盘
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
    
    // 清理IPC监听器
    ipcMain.removeAllListeners();
    
    console.log('清理完成');
  } catch (error) {
    console.error('清理过程中出错:', error);
  }
});

// 处理应用退出
app.on('will-quit', (event) => {
  console.log('应用即将退出');
});

// 创建悬浮球窗口函数
function createFloatingBall() {
  // 获取屏幕尺寸
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // 声明超时变量
  let showTimeout;
  
  // 创建一个全屏透明的悬浮球窗口
  floatingBallWin = new BrowserWindow({
    width: width,
    height: height,
    frame: false,
    show: false, // 🔧 修复：初始不显示，等待页面加载完成
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

  // 🔧 添加超时保险机制：如果3秒内页面没有加载完成，强制显示窗口
  showTimeout = setTimeout(() => {
    if (!floatingBallWin.isDestroyed() && !floatingBallWin.isVisible()) {
      console.log('悬浮球加载超时，强制显示窗口');
      floatingBallWin.show();
    }
  }, 3000);

  // 当页面加载完成时
  floatingBallWin.webContents.on('did-finish-load', () => {
    console.log('悬浮球窗口加载完成');
    
    // 清除超时定时器
    if (showTimeout) {
      clearTimeout(showTimeout);
    }
    
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
    `).then(() => {
      // 🔧 修复：CSS注入完成后再显示窗口，避免白色闪屏
      console.log('CSS注入完成，显示悬浮球窗口');
      if (!floatingBallWin.isDestroyed()) {
        floatingBallWin.show();
      }
    }).catch(err => {
      console.error('插入CSS失败:', err);
      // 即使CSS注入失败，也要显示窗口
      if (!floatingBallWin.isDestroyed()) {
        floatingBallWin.show();
      }
    });
  });

  // 开发环境下打开开发者工具
  if (!app.isPackaged) {
    floatingBallWin.webContents.openDevTools({ mode: 'detach' });
  }

  // 当悬浮球窗口关闭时的处理
  floatingBallWin.on('closed', () => {
    // 清理超时定时器
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    floatingBallWin = null;

    // 通知主窗口刷新悬浮球状态（用于设置界面按钮同步）
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('floating-ball-status-changed', { visible: false });
    }

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

