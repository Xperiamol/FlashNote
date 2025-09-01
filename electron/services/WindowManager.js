const { BrowserWindow, screen, shell } = require('electron');
const { EventEmitter } = require('events');
const path = require('path');
const http = require('http');
const isDev = process.env.NODE_ENV === 'development';

class WindowManager extends EventEmitter {
  constructor(settingsService) {
    super();
    this.settingsService = settingsService;
    this.windows = new Map(); // 存储所有窗口
    this.mainWindow = null;
    this.floatingWindow = null;
  }

  /**
   * 检查Vite开发服务器是否可用
   */
  async checkViteServer() {
    if (!isDev) return true;
    
    return new Promise((resolve) => {
      console.log('检查 Vite 服务器状态...');
      const req = http.get('http://localhost:5174/', (res) => {
        console.log(`Vite 服务器响应状态: ${res.statusCode}`);
        resolve(res.statusCode === 200);
      });
      
      req.on('error', (error) => {
        console.error('Vite服务器连接失败:', error.message);
        resolve(false);
      });
      
      req.setTimeout(8000, () => {
        console.error('Vite服务器连接超时 (8秒)');
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * 创建主窗口
   */
  async createMainWindow() {
    try {
      // 获取窗口设置
      const windowSettings = await this.settingsService.getWindowSettings();
      const bounds = this.calculateWindowBounds(windowSettings.data);
      
      // 创建主窗口
      this.mainWindow = new BrowserWindow({
        ...bounds,
        minWidth: 800,
        minHeight: 600,
        show: false, // 先不显示，等加载完成后再显示
        icon: this.getAppIcon(),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../preload.js'),
          webSecurity: true,
          allowRunningInsecureContent: false
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        frame: false,
        transparent: false,
        hasShadow: true,
        resizable: true,
        maximizable: true,
        minimizable: true,
        closable: true
      });

      // 存储窗口引用
      this.windows.set('main', this.mainWindow);

      // 加载应用
      await this.loadApp(this.mainWindow);

      // 设置窗口事件监听
      this.setupMainWindowEvents();

      // 窗口准备好后显示
      this.mainWindow.once('ready-to-show', () => {
        this.mainWindow.show();
        
        // 开发模式下打开开发者工具
        if (isDev) {
          this.mainWindow.webContents.openDevTools();
        }
        
        this.emit('main-window-ready', this.mainWindow);
      });

      console.log('主窗口创建成功');
      return this.mainWindow;
    } catch (error) {
      console.error('创建主窗口失败:', error);
      throw error;
    }
  }

  /**
   * 创建悬浮窗口
   */
  async createFloatingWindow() {
    try {
      if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
        this.floatingWindow.focus();
        return this.floatingWindow;
      }

      this.floatingWindow = new BrowserWindow({
        width: 300,
        height: 400,
        minWidth: 250,
        minHeight: 300,
        maxWidth: 500,
        maxHeight: 800,
        show: false,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        movable: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '../preload.js')
        }
      });

      // 存储窗口引用
      this.windows.set('floating', this.floatingWindow);

      // 加载悬浮窗口页面
      if (isDev) {
        await this.floatingWindow.loadURL('http://localhost:5174/#/floating');
      } else {
        await this.floatingWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
          hash: 'floating'
        });
      }

      // 设置悬浮窗口事件
      this.setupFloatingWindowEvents();

      this.floatingWindow.once('ready-to-show', () => {
        this.floatingWindow.show();
        this.emit('floating-window-ready', this.floatingWindow);
      });

      console.log('悬浮窗口创建成功');
      return this.floatingWindow;
    } catch (error) {
      console.error('创建悬浮窗口失败:', error);
      throw error;
    }
  }

  /**
   * 创建独立笔记窗口
   */
  async createNoteWindow(noteId) {
    try {
      // 在开发模式下检查Vite服务器是否可用
      if (isDev) {
        const isViteServerAvailable = await this.checkViteServer();
        if (!isViteServerAvailable) {
          throw new Error('Vite开发服务器不可用，请确保npm run dev正在运行');
        }
      }
      const noteWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        show: false,
        icon: this.getAppIcon(),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../preload.js'),
          webSecurity: true,
          allowRunningInsecureContent: false
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        frame: false,
        transparent: false,
        hasShadow: true,
        resizable: true,
        maximizable: true,
        minimizable: true,
        closable: true
      });

      // 生成窗口ID
      const windowId = `note-${noteId}-${Date.now()}`;
      this.windows.set(windowId, noteWindow);
      
      // 加载独立窗口页面并传递笔记ID
      if (isDev) {
        await noteWindow.loadURL(`http://localhost:5174/standalone.html?type=note&noteId=${noteId}`);
      } else {
        await noteWindow.loadFile(path.join(__dirname, '../../dist/standalone.html'), {
          query: { type: 'note', noteId }
        });
      }

      // 设置窗口事件
      noteWindow.on('closed', () => {
        this.windows.delete(windowId);
      });

      // 添加页面加载失败的错误处理
      noteWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`独立窗口加载失败: ${errorDescription} (${errorCode}) - URL: ${validatedURL}`);
      });

      // 添加控制台消息监听（包括所有级别）
      noteWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const levelNames = ['verbose', 'info', 'warning', 'error'];
        const levelName = levelNames[level] || 'unknown';
        console.log(`[独立窗口-${levelName}] ${message} (${sourceId}:${line})`);
      });

      // 设置超时显示窗口，防止 ready-to-show 事件不触发
      let windowShown = false;
      const showTimeout = setTimeout(() => {
        if (!windowShown) {
          console.log('ready-to-show 事件超时，强制显示窗口');
          noteWindow.show();
          windowShown = true;
          if (isDev) {
            noteWindow.webContents.openDevTools();
          }
        }
      }, 3000); // 3秒超时

      noteWindow.once('ready-to-show', () => {
        if (!windowShown) {
          clearTimeout(showTimeout);
          console.log('ready-to-show 事件触发，显示窗口');
          noteWindow.show();
          windowShown = true;
          if (isDev) {
            noteWindow.webContents.openDevTools();
          }
        }
      });

      // 添加页面加载完成事件
      noteWindow.webContents.once('did-finish-load', () => {
        console.log('独立窗口页面加载完成');
        if (!windowShown) {
          clearTimeout(showTimeout);
          console.log('页面加载完成，显示窗口');
          noteWindow.show();
          windowShown = true;
          if (isDev) {
            noteWindow.webContents.openDevTools();
          }
        }
      });
      
      // 添加DOM内容加载完成事件监听
      noteWindow.webContents.once('dom-ready', () => {
        console.log('独立窗口DOM准备就绪');
        if (!windowShown) {
          clearTimeout(showTimeout);
          console.log('DOM准备就绪，显示窗口');
          noteWindow.show();
          windowShown = true;
          if (isDev) {
            noteWindow.webContents.openDevTools();
          }
        }
      });
      
      // 添加页面标题更新事件监听
      noteWindow.webContents.on('page-title-updated', () => {
        console.log('独立窗口页面标题已更新');
        if (!windowShown) {
          clearTimeout(showTimeout);
          console.log('页面标题更新，显示窗口');
          noteWindow.show();
          windowShown = true;
          if (isDev) {
            noteWindow.webContents.openDevTools();
          }
        }
      });

      console.log(`笔记窗口创建成功: ${windowId}`);
      return { windowId };
    } catch (error) {
      console.error('创建笔记窗口失败:', error);
      throw error;
    }
  }

  /**
   * 创建独立Todo窗口
   */
  async createTodoWindow(todoData) {
    try {
      // 在开发模式下检查Vite服务器是否可用
      if (isDev) {
        const isViteServerAvailable = await this.checkViteServer();
        if (!isViteServerAvailable) {
          throw new Error('Vite开发服务器不可用，请确保npm run dev正在运行');
        }
      }
      const todoWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 500,
        minHeight: 400,
        show: false,
        icon: this.getAppIcon(),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../preload.js'),
          webSecurity: true,
          allowRunningInsecureContent: false
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        frame: false,
        transparent: false,
        hasShadow: true,
        resizable: true,
        maximizable: true,
        minimizable: true,
        closable: true
      });

      // 生成窗口ID
      const windowId = `todo-${Date.now()}`;
      this.windows.set(windowId, todoWindow);

      // 序列化Todo数据
      const encodedTodoData = encodeURIComponent(JSON.stringify(todoData));

      // 加载独立窗口页面并传递Todo数据
      if (isDev) {
        await todoWindow.loadURL(`http://localhost:5174/standalone.html?type=todo&todoData=${encodedTodoData}`);
      } else {
        await todoWindow.loadFile(path.join(__dirname, '../../dist/standalone.html'), {
          query: { type: 'todo', todoData: encodedTodoData }
        });
      }

      // 设置窗口事件
      todoWindow.on('closed', () => {
        this.windows.delete(windowId);
      });

      // 添加页面加载失败的错误处理
      todoWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`Todo独立窗口加载失败: ${errorDescription} (${errorCode}) - URL: ${validatedURL}`);
      });

      // 添加控制台错误监听
      todoWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        if (level === 3) { // 错误级别
          console.error(`Todo独立窗口控制台错误: ${message} (${sourceId}:${line})`);
        }
      });

      todoWindow.once('ready-to-show', () => {
        todoWindow.show();
        if (isDev) {
          todoWindow.webContents.openDevTools();
        }
      });

      console.log(`Todo窗口创建成功: ${windowId}`);
      return { windowId };
    } catch (error) {
      console.error('创建Todo窗口失败:', error);
      throw error;
    }
  }

  /**
   * 设置主窗口事件监听
   */
  setupMainWindowEvents() {
    if (!this.mainWindow) return;

    // 窗口关闭事件
    this.mainWindow.on('close', async (event) => {
      // 保存窗口状态
      await this.saveWindowState(this.mainWindow);
      this.emit('main-window-closing', this.mainWindow);
    });

    // 窗口关闭后
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      this.windows.delete('main');
      this.emit('main-window-closed');
    });

    // 窗口最小化
    this.mainWindow.on('minimize', () => {
      this.emit('main-window-minimized');
    });

    // 窗口最大化
    this.mainWindow.on('maximize', () => {
      this.emit('main-window-maximized');
    });

    // 窗口恢复
    this.mainWindow.on('unmaximize', () => {
      this.emit('main-window-unmaximized');
    });

    // 窗口获得焦点
    this.mainWindow.on('focus', () => {
      this.emit('main-window-focused');
    });

    // 窗口失去焦点
    this.mainWindow.on('blur', () => {
      this.emit('main-window-blurred');
    });

    // 窗口大小改变
    this.mainWindow.on('resize', () => {
      this.emit('main-window-resized');
    });

    // 窗口移动
    this.mainWindow.on('move', () => {
      this.emit('main-window-moved');
    });

    // 处理外部链接
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // 阻止导航到外部URL
    this.mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);
      
      if (parsedUrl.origin !== 'http://localhost:5174' && !navigationUrl.startsWith('file://')) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    });
  }

  /**
   * 设置悬浮窗口事件监听
   */
  setupFloatingWindowEvents() {
    if (!this.floatingWindow) return;

    this.floatingWindow.on('closed', () => {
      this.floatingWindow = null;
      this.windows.delete('floating');
      this.emit('floating-window-closed');
    });

    // 悬浮窗口失去焦点时保持置顶
    this.floatingWindow.on('blur', () => {
      if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
        this.floatingWindow.setAlwaysOnTop(true);
      }
    });
  }

  /**
   * 加载应用
   */
  async loadApp(window) {
    if (isDev) {
      await window.loadURL('http://localhost:5174');
    } else {
      await window.loadFile(path.join(__dirname, '../../dist/index.html'));
    }
  }

  /**
   * 计算窗口边界
   */
  calculateWindowBounds(windowSettings) {
    const { window_width, window_height, window_x, window_y } = windowSettings;
    
    // 获取主显示器信息
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    // 默认尺寸
    const width = Math.min(window_width || 1200, screenWidth);
    const height = Math.min(window_height || 800, screenHeight);
    
    // 计算位置
    let x, y;
    
    if (window_x === 'center' || !window_x) {
      x = Math.round((screenWidth - width) / 2);
    } else {
      x = Math.max(0, Math.min(window_x, screenWidth - width));
    }
    
    if (window_y === 'center' || !window_y) {
      y = Math.round((screenHeight - height) / 2);
    } else {
      y = Math.max(0, Math.min(window_y, screenHeight - height));
    }
    
    return { width, height, x, y };
  }

  /**
   * 保存窗口状态
   */
  async saveWindowState(window) {
    try {
      if (!window || window.isDestroyed()) return;
      
      const bounds = window.getBounds();
      await this.settingsService.saveWindowState(bounds);
    } catch (error) {
      console.error('保存窗口状态失败:', error);
    }
  }

  /**
   * 获取应用图标
   */
  getAppIcon() {
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    return iconPath;
  }

  /**
   * 获取主窗口
   */
  getMainWindow() {
    return this.mainWindow;
  }

  /**
   * 获取悬浮窗口
   */
  getFloatingWindow() {
    return this.floatingWindow;
  }

  /**
   * 获取指定窗口
   */
  getWindow(id) {
    return this.windows.get(id);
  }

  /**
   * 获取所有窗口
   */
  getAllWindows() {
    return Array.from(this.windows.values());
  }

  /**
   * 关闭指定窗口
   */
  closeWindow(id) {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.close();
      return true;
    }
    return false;
  }

  /**
   * 关闭所有窗口
   */
  closeAllWindows() {
    for (const [id, window] of this.windows) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
    this.windows.clear();
  }

  /**
   * 显示主窗口
   */
  showMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 隐藏主窗口
   */
  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  /**
   * 切换主窗口显示状态
   */
  toggleMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideMainWindow();
      } else {
        this.showMainWindow();
      }
    }
  }

  /**
   * 切换悬浮窗口
   */
  async toggleFloatingWindow() {
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      this.floatingWindow.close();
    } else {
      await this.createFloatingWindow();
    }
  }

  /**
   * 最小化到系统托盘
   */
  minimizeToTray() {
    if (this.mainWindow) {
      this.mainWindow.hide();
      this.emit('minimized-to-tray');
    }
  }

  /**
   * 从系统托盘恢复
   */
  restoreFromTray() {
    this.showMainWindow();
    this.emit('restored-from-tray');
  }

  /**
   * 重新加载主窗口
   */
  reloadMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.reload();
    }
  }

  /**
   * 切换开发者工具
   */
  toggleDevTools(windowId = 'main') {
    const window = this.windows.get(windowId);
    if (window) {
      window.webContents.toggleDevTools();
    }
  }

  /**
   * 获取窗口统计信息
   */
  getWindowStats() {
    return {
      total: this.windows.size,
      main: this.mainWindow ? 1 : 0,
      floating: this.floatingWindow ? 1 : 0,
      notes: this.windows.size - (this.mainWindow ? 1 : 0) - (this.floatingWindow ? 1 : 0)
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.closeAllWindows();
    this.removeAllListeners();
  }
}

module.exports = WindowManager;