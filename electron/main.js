// 加载环境变量
require('dotenv').config()

const { app, BrowserWindow, ipcMain, dialog, clipboard, Notification, shell, Tray, Menu, nativeImage, protocol, nativeTheme } = require('electron')
const path = require('path')
const fs = require('fs')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 注册自定义协议（必须在 app.whenReady 之前）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
])

// 导入服务
const DatabaseManager = require('./dao/DatabaseManager')
const NoteService = require('./services/NoteService')
const SettingsService = require('./services/SettingsService')
const TodoService = require('./services/TodoService')
const TagService = require('./services/TagService')
const WindowManager = require('./services/WindowManager')
const DataImportService = require('./services/DataImportService')
const ShortcutService = require('./services/ShortcutService')
const NotificationService = require('./services/NotificationService')
const { CloudSyncManager } = require('./services/CloudSyncManager')
const ImageService = require('./services/ImageService')
const { getInstance: getImageStorageInstance } = require('./services/ImageStorageService')
const PluginManager = require('./services/PluginManager')
const AIService = require('./services/AIService')
const STTService = require('./services/STTService')
const Mem0Service = require('./services/Mem0Service')
const HistoricalDataMigrationService = require('./services/HistoricalDataMigrationService')
const IpcHandlerFactory = require('./utils/ipcHandlerFactory')
const CalDAVSyncService = require('./services/CalDAVSyncService')
const GoogleCalendarService = require('./services/GoogleCalendarService')
const ProxyService = require('./services/ProxyService')

// 保持对窗口对象的全局引用，如果不这样做，当JavaScript对象被垃圾回收时，窗口将自动关闭
let mainWindow
let services = {}
let windowManager
let shortcutService
let tray = null
let pluginManager

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false, // 安全考虑，禁用node集成
      contextIsolation: true, // 启用上下文隔离
      enableRemoteModule: false, // 禁用remote模块
      preload: path.join(__dirname, 'preload.js') // 预加载脚本
    },
    titleBarStyle: 'hidden', // 隐藏默认标题栏，使用自定义标题栏
    frame: false, // 完全隐藏窗口边框
    show: false // 先不显示窗口，等加载完成后再显示
  })

  // 处理新窗口打开请求（阻止外部链接在新窗口中打开）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Main] 拦截新窗口请求:', url)
    
    // 如果是 Excalidraw 素材库相关的 URL，在默认浏览器中打开
    if (url.includes('excalidraw.com') || url.includes('libraries.excalidraw.com')) {
      console.log('[Main] 在外部浏览器中打开 Excalidraw 链接')
      shell.openExternal(url)
      return { action: 'deny' }
    }
    
    // 其他外部链接也在浏览器中打开
    if (url.startsWith('http://') || url.startsWith('https://')) {
      console.log('[Main] 在外部浏览器中打开链接:', url)
      shell.openExternal(url)
      return { action: 'deny' }
    }
    
    // 阻止所有其他新窗口
    return { action: 'deny' }
  })

  // 加载应用
  if (isDev) {
    mainWindow.loadURL('http://localhost:5174')
    // 开发模式下打开开发者工具
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 当窗口准备好显示时显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    
    // 设置同步事件转发
    setupSyncEventForwarding()
  })

  // 当窗口关闭时触发 - 最小化到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault()
      mainWindow.hide()
      
      // 首次最小化到托盘时显示提示
      if (!global.hasShownTrayNotification) {
        new Notification({
          title: '闪念速记',
          body: '应用已最小化到系统托盘，双击托盘图标可重新打开窗口'
        }).show()
        global.hasShownTrayNotification = true
      }
    }
  })
  
  mainWindow.on('closed', () => {
    // 取消引用window对象，如果你的应用支持多窗口，
    // 通常会把多个window对象存放在一个数组里，
    // 与此同时，你应该删除相应的元素。
    mainWindow = null
  })
}

// 创建系统托盘
function createTray() {
  try {
    // 创建托盘图标 - 根据是否打包使用不同路径
    let iconPath
    let svgIconPath
    
    if (isDev) {
      // 开发环境路径
      iconPath = path.join(__dirname, '../logo.png')
      svgIconPath = path.join(__dirname, '../assets/tray-icon.svg')
    } else {
      // 打包后路径 - 图标文件会被复制到resources目录
      iconPath = path.join(process.resourcesPath, 'logo.png')
      svgIconPath = path.join(process.resourcesPath, 'assets/tray-icon.svg')
    }
    
    let trayIcon
    
    console.log('尝试创建托盘图标，开发环境:', isDev)
    console.log('PNG图标路径:', iconPath)
    console.log('SVG图标路径:', svgIconPath)
    
    // 检查图标文件是否存在
    if (fs.existsSync(iconPath)) {
      console.log('找到logo.png文件')
      trayIcon = nativeImage.createFromPath(iconPath)
      
      // 检查图标是否成功创建
      if (trayIcon.isEmpty()) {
        console.log('logo.png创建的图标为空，尝试使用SVG图标')
        // 如果PNG图标创建失败，尝试使用SVG图标
        if (fs.existsSync(svgIconPath)) {
          trayIcon = nativeImage.createFromPath(svgIconPath)
        }
      }
      
      // 调整图标大小适应托盘 - Windows推荐16x16
      if (!trayIcon.isEmpty()) {
        trayIcon = trayIcon.resize({ width: 16, height: 16 })
        console.log('图标大小已调整为16x16')
      }
    } else {
      console.log('logo.png文件不存在，尝试使用SVG图标')
      // 如果主图标不存在，尝试使用SVG图标
      if (fs.existsSync(svgIconPath)) {
        trayIcon = nativeImage.createFromPath(svgIconPath)
        trayIcon = trayIcon.resize({ width: 16, height: 16 })
      } else {
        console.log('SVG图标也不存在，创建空图标')
        // 创建一个简单的默认图标
        trayIcon = nativeImage.createEmpty()
      }
    }
    
    // 确保图标不为空
    if (trayIcon.isEmpty()) {
      console.log('所有图标都创建失败，尝试创建默认图标')
      // 创建一个简单的默认图标 - 使用Electron内置方法
      try {
        // 创建一个16x16的简单图标数据
        const iconData = Buffer.from([
          // 这是一个简单的16x16 ICO格式图标数据
          0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00, 0x68, 0x04,
          0x00, 0x00, 0x16, 0x00, 0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x20, 0x00,
          0x00, 0x00, 0x01, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ])
        trayIcon = nativeImage.createFromBuffer(iconData)
      } catch (error) {
        console.log('创建默认图标失败，使用空图标:', error.message)
        // 如果还是失败，就使用空图标
        trayIcon = nativeImage.createEmpty()
      }
    }
    
    console.log('创建托盘对象')
    tray = new Tray(trayIcon)
    
    // 设置托盘提示文本
    tray.setToolTip('FlashNote 2.2.2 Epsilon - 快速笔记应用')
    
    // 创建托盘菜单
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore()
            }
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      {
        label: '隐藏窗口',
        click: () => {
          if (mainWindow) {
            mainWindow.hide()
          }
        }
      },
      { type: 'separator' },
      {
        label: '新建笔记',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('create-new-note')
            if (mainWindow.isMinimized()) {
              mainWindow.restore()
            }
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      {
        label: '快速输入',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: async () => {
          try {
            // 创建空白笔记
            const result = await services.noteService.createNote({
              title: '快速笔记',
              content: '',
              category: '',
              tags: []
            });
            
            if (result.success && result.data) {
              // 在独立窗口打开
              await windowManager.createNoteWindow(result.data.id);
            }
          } catch (error) {
            console.error('快速输入失败:', error);
          }
        }
      },
      {
        label: '显示悬浮球',
        click: async () => {
          try {
            await windowManager.createFloatingBall()
          } catch (error) {
            console.error('创建悬浮球失败:', error)
          }
        }
      },
      { type: 'separator' },
      {
        label: '设置',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('open-settings')
            if (mainWindow.isMinimized()) {
              mainWindow.restore()
            }
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      { type: 'separator' },
      {
        label: '退出应用',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => {
          app.quit()
        }
      }
    ])
    
    // 设置托盘菜单
    tray.setContextMenu(contextMenu)
    
    // 双击托盘图标显示/隐藏主窗口
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          if (mainWindow.isMinimized()) {
            mainWindow.restore()
          }
          mainWindow.show()
          mainWindow.focus()
        }
      }
    })
    
    console.log('系统托盘创建成功')
  } catch (error) {
    console.error('创建系统托盘失败:', error)
  }
}

// 初始化服务
async function initializeServices() {
  try {
    // 初始化数据库
    const dbManager = DatabaseManager.getInstance()
    await dbManager.initialize()
    
    // 初始化服务
    services.noteService = new NoteService()
    services.settingsService = new SettingsService()
    services.todoService = new TodoService()
    services.tagService = new TagService()
    services.dataImportService = new DataImportService(services.noteService, services.settingsService)
    services.imageService = new ImageService()
    
    // 暴露 DAO 供插件使用
    const NoteDAO = require('./dao/NoteDAO')
    const TodoDAO = require('./dao/TodoDAO')
    services.noteDAO = new NoteDAO()
    services.todoDAO = new TodoDAO()
    
    // 初始化AI服务
    const SettingDAO = require('./dao/SettingDAO')
    const settingDAO = new SettingDAO()
    services.aiService = new AIService(settingDAO)
    await services.aiService.initialize()
    
    // 初始化STT服务
    services.sttService = new STTService(settingDAO)
    await services.sttService.initialize()
    
    // 初始化 Mem0 服务 - 使用正确的数据库路径
    const dbPath = path.join(app.getPath('userData'), 'database', 'flashnote.db')
    const appDataPath = app.getPath('userData')
    services.mem0Service = new Mem0Service(dbPath, appDataPath)
    services.migrationService = new HistoricalDataMigrationService(services.mem0Service)
    
    // 异步初始化，不阻塞启动
    services.mem0Service.initialize().then(result => {
      if (result.success) {
        console.log('[Main] Mem0 service initialized')
      } else {
        console.warn('[Main] Mem0 service initialization failed:', result.error)
      }
    }).catch(error => {
      console.error('[Main] Mem0 service error:', error)
    })
    
    // 初始化通知服务
    services.notificationService = new NotificationService()
    
    // 初始化云同步管理器
    services.cloudSyncManager = new CloudSyncManager()
    await services.cloudSyncManager.initialize()
    
    // 初始化 CalDAV 日历同步服务
    services.calDAVSyncService = new CalDAVSyncService()
    console.log('[Main] CalDAV sync service initialized')
    
    // 初始化 Google Calendar OAuth 同步服务
    services.googleCalendarService = new GoogleCalendarService()
    console.log('[Main] Google Calendar service initialized')
    
    // 初始化代理服务
    services.proxyService = new ProxyService()
    console.log('[Main] Proxy service initialized')
    
    // 将通知服务连接到TodoService
    services.todoService.setNotificationService(services.notificationService)
    
    // 监听通知点击事件，打开主窗口并聚焦到待办事项
    services.notificationService.on('notification-clicked', (todo) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        if (!mainWindow.isVisible()) mainWindow.show()
        mainWindow.focus()
        
        // 发送事件到渲染进程，让前端跳转到对应的待办事项
        mainWindow.webContents.send('todo:focus', todo.id)
      }
    })
    
    // 启动通知服务
    services.notificationService.start()
    
    // 初始化窗口管理器
    windowManager = new WindowManager()
    
  // 初始化快捷键服务
  shortcutService = new ShortcutService()
  services.shortcutService = shortcutService

    // 转发 NoteService 事件到所有渲染进程
    const broadcastToAll = (channel, data) => {
      try {
        BrowserWindow.getAllWindows().forEach(win => {
          if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data)
          }
        })
      } catch (err) {
        console.error(`广播事件失败: ${channel}`, err)
      }
    }

    if (services && services.noteService) {
      services.noteService.on('note-created', (note) => {
        broadcastToAll('note:created', note)
      })
      services.noteService.on('note-updated', (note) => {
        broadcastToAll('note:updated', note)
      })
      services.noteService.on('note-deleted', (payload) => {
        broadcastToAll('note:deleted', payload)
      })
    }

    pluginManager = new PluginManager({
      app,
      services,
      shortcutService,
      windowAccessor: () => BrowserWindow.getAllWindows(),
      mainWindowAccessor: () => mainWindow,
      logger: console,
      isPackaged: app.isPackaged
    })

    services.pluginManager = pluginManager

    if (shortcutService && typeof shortcutService.setPluginManager === 'function') {
      shortcutService.setPluginManager(pluginManager)
    }

    await pluginManager.initialize()

    pluginManager.on('store-event', (event) => {
      broadcastToAll('plugin-store:event', event)
    })

    pluginManager.on('store-event', (event) => {
      if (event?.type === 'ready') {
        console.log(`插件已就绪: ${event.plugin?.manifest?.name || event.pluginId}`)
      }
    })

    // 检查是否为首次启动，如果没有笔记则创建示例笔记
    try {
      const notesResult = await services.noteService.getNotes({ limit: 1 })
      if (notesResult.success && notesResult.data && notesResult.data.notes && notesResult.data.notes.length === 0) {
        console.log('检测到首次启动，创建示例笔记')
        const welcomeNote = {
          title: '欢迎使用 FlashNote 2.2.2 Epsilon！',
          content: `# 欢迎使用 FlashNote 2.3！ 🎉

恭喜你成功安装了 FlashNote，这是一个现代化的本地笔记应用。

## 2.3 版本新功能

### 白板笔记
- **Excalidraw 集成**：创建白板笔记，支持手绘图形和流程图
- **素材库支持**：使用内置素材库或浏览在线素材库
- **独立窗口优化**：支持拖拽白板笔记到独立窗口中编辑
- **PNG 导出**：一键导出白板为高清图片

### Markdown 增强
- **扩展语法**：支持高亮（==text==）、@orange{彩色文本}、[[Wiki 链接]]、#标签等
- **自定义MD插件**：完整可插拔的 Markdown 插件系统
- **实时预览**：所见即所得的编辑体验（测试中）

### 插件系统
- **扩展生态**：支持安装第三方插件
- **本地开发**：可以开发自己的插件
- **主题定制**：插件可以注入自定义样式
- **命令面板**：Ctrl+Shift+P 打开命令面板使用插件功能

### 同步优化
- **新增日历同步**：可选CALDAV和Google Calendar（需要代理）
- **智能冲突处理**：基于时间戳的智能冲突解决与增量同步

## 快速开始

### 基本操作
- **创建笔记**：点击左上角的 "新建" 按钮或使用快捷键 \`Ctrl+N\`
- **创建白板**：选择"白板笔记"类型，使用 Excalidraw 进行创作
- **搜索笔记**：使用顶部搜索框快速找到你需要的笔记
- **标签管理**：为笔记添加标签，方便分类和查找
- **拖拽窗口**：试试拖动笔记列表到窗口外~

### 快捷键
- \`Ctrl+N\`：新建笔记
- \`Ctrl+S\`：保存笔记
- \`Ctrl+F\`：搜索笔记
- \`Ctrl+Shift+P\`：打开命令面板
- \`Ctrl+Shift+N\`：快速输入

## 特色功能

### Markdown 支持
这个笔记应用支持 **Markdown** 语法，你可以：

- 使用 **粗体** 和 *斜体*
- 使用 ==高亮文本==
- 创建 [[Wiki链接]]
- 添加 #标签
- 创建 [链接](https://github.com)
- 添加代码块：

\`\`\`javascript
console.log('Hello, FlashNote!');
\`\`\`

- 制作任务列表：
  - [x] 安装 FlashNote
  - [x] 阅读欢迎笔记
  - [ ] 创建第一个白板笔记
  - [ ] 尝试插件系统
  - [ ] 探索更多功能

### 白板功能
- 🎨 手绘风格图形
- 📐 多种形状和箭头
- 📝 文本注释
- 🖼️ 图片插入
- 📚 素材库管理
- 💾 自动保存

### 数据安全
- 所有数据都存储在本地，保护你的隐私
- 支持数据导入导出功能
- 自动保存，不用担心数据丢失
- 支持坚果云、Google Calendar 等同步方案

## 开始使用

现在你可以：
1. 创建你的第一个白板笔记
2. 尝试使用 Markdown 扩展语法
3. 打开命令面板（Ctrl+Shift+P）探索插件功能
4. 在设置中配置云同步
5. 探索设置选项，个性化你的使用体验

祝你使用愉快！ 📝✨
By Xperiamol
`,
          tags: ['欢迎', '教程', '2.2.2'],
          category: 'default'
        }
        
        await services.noteService.createNote(welcomeNote)
        console.log('示例笔记创建成功')
      }
    } catch (error) {
      console.error('创建示例笔记失败:', error)
    }

    console.log('所有服务初始化完成')
  } catch (error) {
    console.error('服务初始化失败:', error)
    app.quit()
  }
}

// 处理多实例问题 - 确保只有一个应用实例运行
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果获取锁失败，说明已有实例在运行，退出当前实例
  console.log('应用已在运行，退出当前实例')
  app.quit()
} else {
  // 当第二个实例尝试启动时，聚焦到第一个实例的窗口
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('检测到第二个实例启动，聚焦到主窗口')
    // 如果主窗口存在，显示并聚焦
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Electron初始化完成，创建窗口
  app.whenReady().then(async () => {
  // 注册 app:// 协议处理器
  protocol.handle('app', async (request) => {
    try {
      const url = request.url
      // app://images/abc.png -> images/abc.png
      const relativePath = url.replace('app://', '')
      
      console.log('[Protocol] 处理 app:// 请求:', relativePath)
      
      // 获取完整路径
      const fullPath = services.imageService.getImagePath(relativePath)
      console.log('[Protocol] 完整路径:', fullPath)
      
      // 检查文件是否存在
      if (!fs.existsSync(fullPath)) {
        console.error('[Protocol] 文件不存在:', fullPath)
        return new Response('File not found', { status: 404 })
      }
      
      // 读取文件
      const data = fs.readFileSync(fullPath)
      
      // 确定 MIME 类型
      const ext = path.extname(fullPath).toLowerCase()
      let mimeType = 'application/octet-stream'
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg'
          break
        case '.png':
          mimeType = 'image/png'
          break
        case '.gif':
          mimeType = 'image/gif'
          break
        case '.webp':
          mimeType = 'image/webp'
          break
        case '.svg':
          mimeType = 'image/svg+xml'
          break
      }
      
      console.log('[Protocol] 返回文件，MIME:', mimeType)
      return new Response(data, {
        headers: { 'Content-Type': mimeType }
      })
    } catch (error) {
      console.error('[Protocol] 处理请求失败:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  })
  
  await initializeServices()
  // 数据库迁移已在 DatabaseManager.initialize() 中自动执行
  
  // 加载并应用代理配置
  try {
    const proxyConfig = services.proxyService.getConfig();
    services.proxyService.applyConfig(proxyConfig);
  } catch (error) {
    console.error('[启动] 加载代理配置失败:', error)
  }
  
  createWindow()
  createTray()
  
  // 监听系统主题变化
  nativeTheme.on('updated', () => {
    console.log('[Main] 系统主题变化，当前主题:', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    
    // 通知所有窗口主题变化
    BrowserWindow.getAllWindows().forEach(win => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('system-theme-changed', {
          shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
          themeSource: nativeTheme.themeSource
        })
      }
    })
  })
  
  // 初始化开机自启状态
  try {
    const loginItemSettings = app.getLoginItemSettings()
    const savedAutoLaunch = await services.settingsService.getSetting('autoLaunch')
    
    // 如果系统状态与保存的设置不一致，以系统状态为准
    if (savedAutoLaunch.success && savedAutoLaunch.data !== loginItemSettings.openAtLogin) {
      await services.settingsService.setSetting('autoLaunch', loginItemSettings.openAtLogin)
      console.log('同步开机自启状态:', loginItemSettings.openAtLogin)
    }
  } catch (error) {
    console.error('初始化开机自启状态失败:', error)
  }
  
  // 设置快捷键服务的主窗口和窗口管理器引用
  if (shortcutService && mainWindow) {
    shortcutService.setMainWindow(mainWindow)
    shortcutService.setWindowManager(windowManager)
    
    // 加载并注册快捷键
    try {
      const { DEFAULT_SHORTCUTS } = require('./utils/shortcutUtils')
      const shortcutsResult = await services.settingsService.getSetting('shortcuts')
      let shortcuts = shortcutsResult.success ? shortcutsResult.data : null
      
      // 检查配置数据是否有效
      const isValidConfig = shortcuts && 
        typeof shortcuts === 'object' && 
        !Array.isArray(shortcuts) &&
        Object.keys(shortcuts).some(key => key.includes('.')) && // 检查是否有正确的快捷键ID格式
        Object.values(shortcuts).some(config => config && config.type && config.currentKey)
      
      let registrationStats
      
      if (isValidConfig) {
        console.log('使用已保存的快捷键配置')
        registrationStats = await shortcutService.registerAllShortcuts(shortcuts)
      } else {
        console.log('快捷键配置无效或不存在，重置为默认配置')
        // 强制重置为默认配置
        await services.settingsService.setSetting('shortcuts', DEFAULT_SHORTCUTS)
        registrationStats = await shortcutService.registerAllShortcuts(DEFAULT_SHORTCUTS)
      }
      
      // 输出注册统计信息
      if (registrationStats) {
        console.log('快捷键注册统计:', {
          总数: registrationStats.total,
          成功: registrationStats.registered,
          跳过: registrationStats.skipped,
          失败: registrationStats.failed
        })
        
        if (registrationStats.failed > 0) {
          console.warn('部分快捷键注册失败，可能被其他应用占用')
        }
      }
    } catch (error) {
      console.error('初始化快捷键失败:', error)
      // 使用默认快捷键配置
      try {
        const { DEFAULT_SHORTCUTS } = require('./utils/shortcutUtils')
        await services.settingsService.setSetting('shortcuts', DEFAULT_SHORTCUTS)
        const fallbackStats = await shortcutService.registerAllShortcuts(DEFAULT_SHORTCUTS)
        console.log('使用默认快捷键配置，注册统计:', fallbackStats)
      } catch (fallbackError) {
        console.error('使用默认快捷键配置也失败:', fallbackError)
      }
    }
  }
  })
}

// 当所有窗口关闭时的处理 - 由于有托盘，不直接退出应用
app.on('window-all-closed', () => {
  // 有托盘时，即使所有窗口关闭也不退出应用
  // 用户需要通过托盘菜单或快捷键退出
  console.log('所有窗口已关闭，应用继续在托盘中运行')
})

// 应用即将退出时的清理工作
app.on('before-quit', () => {
  app.isQuiting = true
  
  // 清理托盘
  if (tray) {
    tray.destroy()
    tray = null
  }
})

app.on('activate', () => {
  // 在macOS上，当单击dock图标并且没有其他窗口打开时，
  // 通常在应用中重新创建一个窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 在这个文件中，你可以包含应用的其他主进程代码
// 你也可以将它们放在单独的文件中并在这里引入

// ============= IPC 处理程序 =============

// 应用基础API
ipcMain.handle('app-version', () => {
  return app.getVersion()
})

ipcMain.handle('hello-world', () => {
  return 'Hello from Electron Main Process!'
})

// 插件商店相关
const ensurePluginManager = () => {
  if (!pluginManager) {
    throw new Error('插件管理器尚未初始化')
  }
  return pluginManager
}

ipcMain.handle('plugin-store:list-available', async () => {
  try {
    const manager = ensurePluginManager()
    return await manager.listAvailablePlugins()
  } catch (error) {
    console.error('获取插件列表失败:', error)
    return []
  }
})

ipcMain.handle('plugin-store:list-installed', async () => {
  try {
    const manager = ensurePluginManager()
    return await manager.listInstalledPlugins()
  } catch (error) {
    console.error('获取已安装插件列表失败:', error)
    return []
  }
})

ipcMain.handle('plugin-store:scan-local', async () => {
  try {
    const manager = ensurePluginManager()
    return await manager.scanLocalPlugins()
  } catch (error) {
    console.error('扫描本地插件失败:', error)
    return []
  }
})

ipcMain.handle('plugin-store:get-details', async (event, pluginId) => {
  try {
    const manager = ensurePluginManager()
    return await manager.getPluginDetails(pluginId)
  } catch (error) {
    console.error(`获取插件详情失败: ${pluginId}`, error)
    return null
  }
})

ipcMain.handle('plugin-store:install', async (event, pluginId) => {
  try {
    const manager = ensurePluginManager()
    const data = await manager.installPlugin(pluginId)
    return { success: true, data }
  } catch (error) {
    console.error(`安装插件失败: ${pluginId}`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('plugin-store:uninstall', async (event, pluginId) => {
  try {
    const manager = ensurePluginManager()
    await manager.uninstallPlugin(pluginId)
    return { success: true }
  } catch (error) {
    console.error(`卸载插件失败: ${pluginId}`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('plugin-store:enable', async (event, pluginId) => {
  try {
    const manager = ensurePluginManager()
    const data = await manager.enablePlugin(pluginId)
    return { success: true, data }
  } catch (error) {
    console.error(`启用插件失败: ${pluginId}`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('plugin-store:disable', async (event, pluginId) => {
  try {
    const manager = ensurePluginManager()
    const data = await manager.disablePlugin(pluginId)
    return { success: true, data }
  } catch (error) {
    console.error(`禁用插件失败: ${pluginId}`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('plugin-store:execute-command', async (event, pluginId, commandId, payload) => {
  try {
    const manager = ensurePluginManager()
    const data = await manager.executeCommand(pluginId, commandId, payload)
    return { success: true, data }
  } catch (error) {
    console.error(`执行插件命令失败: ${pluginId} -> ${commandId}`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('plugin-store:open-plugin-folder', async (event, pluginId) => {
  try {
    const manager = ensurePluginManager()
    const pluginPath = manager.getPluginPath(pluginId)
    if (!pluginPath) {
      return { success: false, error: '插件未安装' }
    }
    const { shell } = require('electron')
    await shell.openPath(pluginPath)
    return { success: true }
  } catch (error) {
    console.error(`打开插件目录失败: ${pluginId}`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('plugin-store:open-plugins-directory', async () => {
  try {
    const manager = ensurePluginManager()
    const { shell } = require('electron')
    // 打开插件目录
    const isDev = process.env.NODE_ENV === 'development'
    const localPluginsPath = isDev 
      ? path.join(app.getAppPath(), 'plugins', 'examples')
      : path.join(process.resourcesPath, 'plugins', 'examples')
    await shell.openPath(localPluginsPath)
    return { success: true }
  } catch (error) {
    console.error('打开插件目录失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('plugin-store:load-plugin-file', async (event, pluginId, filePath) => {
  try {
    const manager = ensurePluginManager()
    const pluginPath = manager.getPluginPath(pluginId)
    if (!pluginPath) {
      return { success: false, error: '插件未安装' }
    }
    
    const fullPath = path.join(pluginPath, filePath.replace(/^\//, ''))
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: '文件不存在' }
    }
    
    const content = fs.readFileSync(fullPath, 'utf8')
    return { success: true, content, baseUrl: `file://${pluginPath}/` }
  } catch (error) {
    console.error(`读取插件文件失败: ${pluginId}/${filePath}`, error)
    return { success: false, error: error.message }
  }
})

// ==================== 云同步相关 IPC ====================
// 注意：这些旧的处理器已被删除，新的处理器在文件末尾统一管理

// 设置同步事件监听，将事件转发到渲染进程
function setupSyncEventForwarding() {
  if (!services.cloudSyncManager) return
  
  // 使用 getActiveService() 获取当前活跃的同步服务实例
  const activeService = services.cloudSyncManager.getActiveService()
  if (!activeService) return
  
  // 监听同步开始事件
  activeService.on('syncStart', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:start')
    }
  })
  
  // 监听同步完成事件
  activeService.on('syncComplete', (result) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:complete', result)
    }
  })
  
  // 监听同步错误事件
  activeService.on('syncError', (error) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:error', { message: error.message })
    }
  })
  
  // 监听冲突检测事件
  activeService.on('conflictDetected', (conflict) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync:conflict', conflict)
    }
  })
}

// 在窗口创建后调用
// setupSyncEventForwarding() - 需要在 createWindow 后调用

// 数据库调试相关（用于排查持久化问题）
ipcMain.handle('db:get-info', async () => {
  try {
    const dbManager = DatabaseManager.getInstance()
    return dbManager.getInfo()
  } catch (err) {
    return { error: err?.message || 'unknown error' }
  }
})

// 数据库修复
ipcMain.handle('db:repair', async () => {
  try {
    const dbManager = DatabaseManager.getInstance()
    return await dbManager.repairDatabase()
  } catch (err) {
    console.error('数据库修复失败:', err)
    return { success: false, error: err?.message || 'unknown error' }
  }
})

// 笔记相关IPC处理
ipcMain.handle('note:create', async (event, noteData) => {
  return await services.noteService.createNote(noteData)
})

ipcMain.handle('note:get-by-id', async (event, id) => {
  return await services.noteService.getNoteById(id)
})

ipcMain.handle('note:get-all', async (event, options) => {
  return await services.noteService.getNotes(options)
})

ipcMain.handle('note:get-pinned', async (event) => {
  return await services.noteService.getPinnedNotes()
})

ipcMain.handle('note:get-deleted', async (event) => {
  return await services.noteService.getDeletedNotes()
})

ipcMain.handle('note:get-recently-modified', async (event, limit) => {
  return await services.noteService.getRecentlyModifiedNotes(limit)
})

ipcMain.handle('note:update', async (event, id, updates) => {
  return await services.noteService.updateNote(id, updates)
})

ipcMain.handle('note:auto-save', async (event, id, content) => {
  return await services.noteService.autoSaveNote(id, { content })
})

ipcMain.handle('note:delete', async (event, id) => {
  return await services.noteService.deleteNote(id)
})

ipcMain.handle('note:restore', async (event, id) => {
  return await services.noteService.restoreNote(id)
})

ipcMain.handle('note:permanent-delete', async (event, id) => {
  return await services.noteService.permanentDeleteNote(id)
})

ipcMain.handle('note:toggle-pin', async (event, id) => {
  return await services.noteService.togglePinNote(id)
})

ipcMain.handle('note:search', async (event, query, options) => {
  return await services.noteService.searchNotes(query, options)
})

ipcMain.handle('note:batch-update', async (event, ids, updates) => {
  return await services.noteService.batchUpdateNotes(ids, updates)
})

ipcMain.handle('note:batch-delete', async (event, ids) => {
  return await services.noteService.batchDeleteNotes(ids)
})

ipcMain.handle('note:batch-restore', async (event, ids) => {
  return await services.noteService.batchRestoreNotes(ids)
})

ipcMain.handle('note:batch-permanent-delete', async (event, ids) => {
  return await services.noteService.batchPermanentDeleteNotes(ids)
})

ipcMain.handle('note:batch-set-tags', async (event, params) => {
  return await services.noteService.batchSetTags(params)
})

ipcMain.handle('note:get-stats', async (event) => {
  return await services.noteService.getStats()
})

ipcMain.handle('note:export', async (event, options) => {
  return await services.noteService.exportNotes(options)
})

ipcMain.handle('note:import', async (event, data) => {
  return await services.noteService.importNotes(data)
})

// 设置相关IPC处理
ipcMain.handle('setting:get', async (event, key) => {
  return await services.settingsService.getSetting(key)
})

ipcMain.handle('setting:get-multiple', async (event, keys) => {
  return await services.settingsService.getMultipleSettings(keys)
})

ipcMain.handle('setting:get-all', async (event) => {
  return await services.settingsService.getAllSettings()
})

ipcMain.handle('setting:get-by-type', async (event, type) => {
  return await services.settingsService.getSettingsByType(type)
})

ipcMain.handle('setting:get-theme', async (event) => {
  return await services.settingsService.getThemeSettings()
})

ipcMain.handle('setting:get-window', async (event) => {
  return await services.settingsService.getWindowSettings()
})

ipcMain.handle('setting:get-editor', async (event) => {
  return await services.settingsService.getEditorSettings()
})

ipcMain.handle('setting:set', async (event, key, value) => {
  return await services.settingsService.setSetting(key, value)
})

ipcMain.handle('setting:set-multiple', async (event, settings) => {
  return await services.settingsService.setMultipleSettings(settings)
})

ipcMain.handle('setting:delete', async (event, key) => {
  return await services.settingsService.deleteSetting(key)
})

ipcMain.handle('setting:delete-multiple', async (event, keys) => {
  return await services.settingsService.deleteMultipleSettings(keys)
})

ipcMain.handle('setting:reset', async (event, key) => {
  return await services.settingsService.resetSetting(key)
})

ipcMain.handle('setting:reset-all', async (event) => {
  return await services.settingsService.resetAllSettings()
})

ipcMain.handle('setting:search', async (event, query) => {
  return await services.settingsService.searchSettings(query)
})

ipcMain.handle('setting:get-stats', async (event) => {
  return await services.settingsService.getStats()
})

ipcMain.handle('setting:export', async (event) => {
  return await services.settingsService.exportSettings()
})

ipcMain.handle('setting:import', async (event, data) => {
  return await services.settingsService.importSettings(data)
})

ipcMain.handle('setting:select-wallpaper', async (event) => {
  return await services.settingsService.selectWallpaper()
})

// 开机自启相关IPC处理
ipcMain.handle('setting:set-auto-launch', async (event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath
    })
    await services.settingsService.setSetting('autoLaunch', enabled)
    return { success: true }
  } catch (error) {
    console.error('设置开机自启失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('setting:get-auto-launch', async (event) => {
  try {
    const loginItemSettings = app.getLoginItemSettings()
    return loginItemSettings.openAtLogin
  } catch (error) {
    console.error('获取开机自启状态失败:', error)
    return false
  }
})

// 代理配置IPC处理
ipcMain.handle('proxy:get-config', async (event) => {
  const result = services.proxyService.getConfig();
  return { success: true, data: result };
})

ipcMain.handle('proxy:save-config', async (event, config) => {
  return services.proxyService.saveConfig(config);
})

ipcMain.handle('proxy:test', async (event, config) => {
  return services.proxyService.testConnection(config);
})

// 数据导入导出IPC处理
ipcMain.handle('data:export-notes', async (event, options) => {
  return await services.dataImportService.exportNotes(options)
})

ipcMain.handle('data:export-settings', async (event, filePath) => {
  return await services.dataImportService.exportSettings(filePath)
})

ipcMain.handle('data:import-notes', async (event, options) => {
  return await services.dataImportService.importNotes(options)
})

ipcMain.handle('data:import-settings', async (event, filePath) => {
  return await services.dataImportService.importSettings(filePath)
})

ipcMain.handle('data:import-folder', async (event) => {
  return await services.dataImportService.importFolder()
})

ipcMain.handle('data:get-supported-formats', async (event) => {
  return services.dataImportService.getSupportedFormats()
})

ipcMain.handle('data:get-stats', async (event) => {
  return services.dataImportService.getStats()
})

ipcMain.handle('data:select-file', async (event) => {
  return await services.dataImportService.selectFile()
})

// AI 相关 IPC 处理
ipcMain.handle('ai:get-config', async (event) => {
  try {
    return await services.aiService.getConfig()
  } catch (error) {
    console.error('获取AI配置失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('ai:save-config', async (event, config) => {
  try {
    return await services.aiService.saveConfig(config)
  } catch (error) {
    console.error('保存AI配置失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('ai:test-connection', async (event, config) => {
  try {
    return await services.aiService.testConnection(config)
  } catch (error) {
    console.error('测试AI连接失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('ai:get-providers', async (event) => {
  try {
    return services.aiService.getProviders()
  } catch (error) {
    console.error('获取AI提供商列表失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('ai:chat', async (event, messages, options) => {
  try {
    return await services.aiService.chat(messages, options)
  } catch (error) {
    console.error('AI聊天失败:', error)
    return { success: false, error: error.message }
  }
})

// STT (Speech-to-Text) 相关 IPC 处理
ipcMain.handle('stt:get-config', async (event) => {
  try {
    return await services.sttService.getConfig()
  } catch (error) {
    console.error('获取STT配置失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('stt:save-config', async (event, config) => {
  try {
    return await services.sttService.saveConfig(config)
  } catch (error) {
    console.error('保存STT配置失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('stt:test-connection', async (event, config) => {
  try {
    return await services.sttService.testConnection(config)
  } catch (error) {
    console.error('测试STT连接失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('stt:get-providers', async (event) => {
  try {
    return services.sttService.getProviders()
  } catch (error) {
    console.error('获取STT提供商列表失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('stt:transcribe', async (event, { audioFile, options }) => {
  try {
    return await services.sttService.transcribe(audioFile, options)
  } catch (error) {
    console.error('语音转文字失败:', error)
    return { success: false, error: error.message }
  }
})

// Mem0 记忆管理相关 IPC 处理
ipcMain.handle('mem0:add', async (event, { userId, content, options }) => {
  try {
    return await services.mem0Service.addMemory(userId, content, options)
  } catch (error) {
    console.error('添加记忆失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('mem0:search', async (event, { userId, query, options }) => {
  try {
    const results = await services.mem0Service.searchMemories(userId, query, options)
    return { success: true, results }
  } catch (error) {
    console.error('搜索记忆失败:', error)
    return { success: false, error: error.message, results: [] }
  }
})

ipcMain.handle('mem0:get', async (event, { userId, options }) => {
  try {
    console.log('[Mem0] 获取记忆请求:', { userId, options })
    const memories = await services.mem0Service.getMemories(userId, options)
    console.log(`[Mem0] 返回 ${memories.length} 条记忆`)
    if (memories.length > 0) {
      console.log('[Mem0] 第一条记忆类别:', memories[0].category)
    }
    return { success: true, memories }
  } catch (error) {
    console.error('获取记忆列表失败:', error)
    return { success: false, error: error.message, memories: [] }
  }
})

ipcMain.handle('mem0:delete', async (event, { memoryId }) => {
  try {
    const deleted = await services.mem0Service.deleteMemory(memoryId)
    return { success: deleted }
  } catch (error) {
    console.error('删除记忆失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('mem0:clear', async (event, { userId }) => {
  try {
    const count = await services.mem0Service.clearUserMemories(userId)
    return { success: true, count }
  } catch (error) {
    console.error('清除记忆失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('mem0:stats', async (event, { userId }) => {
  try {
    const stats = await services.mem0Service.getStats(userId)
    return { success: true, stats }
  } catch (error) {
    console.error('获取统计信息失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('mem0:is-available', async (event) => {
  try {
    return { available: services.mem0Service.isAvailable() }
  } catch (error) {
    return { available: false }
  }
})

ipcMain.handle('mem0:migrate-historical', async (event) => {
  try {
    console.log('[Mem0] 开始分析历史数据...')
    
    const userId = 'current_user'
    let memoryCount = 0
    
    // 获取数据库实例
    const dbManager = DatabaseManager.getInstance()
    const db = dbManager.getDatabase()
    
    // 1. 分析待办事项模式
    const todos = db.prepare(`
      SELECT * FROM todos 
      WHERE created_at >= date('now', '-90 days')
      ORDER BY created_at DESC
    `).all()
    
    console.log(`[Mem0] 找到 ${todos.length} 个待办事项`)
    
    if (todos.length > 0) {
      // 统计优先级偏好
      const importantCount = todos.filter(t => t.is_important === 1).length
      const urgentCount = todos.filter(t => t.is_urgent === 1).length
      const importantRatio = (importantCount / todos.length * 100).toFixed(0)
      const urgentRatio = (urgentCount / todos.length * 100).toFixed(0)
      
      if (importantCount > todos.length * 0.3) {
        await services.mem0Service.addMemory(userId, 
          `用户在过去90天创建了${todos.length}个待办事项,其中${importantRatio}%标记为重要,显示出对重要任务的重视`, 
          {
            category: 'task_planning',
            metadata: { source: 'historical_analysis', type: 'priority_pattern' }
          }
        )
        memoryCount++
      }
      
      if (urgentCount > todos.length * 0.3) {
        await services.mem0Service.addMemory(userId, 
          `用户有${urgentRatio}%的任务标记为紧急,倾向于处理时间敏感的工作`, 
          {
            category: 'task_planning',
            metadata: { source: 'historical_analysis', type: 'urgency_pattern' }
          }
        )
        memoryCount++
      }
      
      // 分析常见任务类型
      const taskTypes = new Map()
      todos.forEach(todo => {
        const keywords = todo.content.split(/[,，、\s]+/).filter(w => w.length > 1)
        keywords.forEach(kw => {
          taskTypes.set(kw, (taskTypes.get(kw) || 0) + 1)
        })
      })
      
      const frequentKeywords = Array.from(taskTypes.entries())
        .filter(([_, count]) => count >= 5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([kw]) => kw)
      
      if (frequentKeywords.length > 0) {
        await services.mem0Service.addMemory(userId, 
          `用户经常创建与这些主题相关的任务：${frequentKeywords.join('、')}`, 
          {
            category: 'task_planning',
            metadata: { source: 'historical_analysis', type: 'frequent_topics' }
          }
        )
        memoryCount++
      }
    }
    
    // 2. 分析已完成任务
    const completedTodos = db.prepare(`
      SELECT 
        content,
        is_important,
        is_urgent,
        created_at,
        completed_at,
        JULIANDAY(completed_at) - JULIANDAY(created_at) as completion_days
      FROM todos 
      WHERE is_completed = 1 
      AND completed_at >= date('now', '-90 days')
    `).all()
    
    console.log(`[Mem0] 找到 ${completedTodos.length} 个已完成任务`)
    
    if (completedTodos.length >= 10) {
      const avgCompletionDays = (
        completedTodos.reduce((sum, t) => sum + (t.completion_days || 0), 0) / completedTodos.length
      ).toFixed(1)
      
      await services.mem0Service.addMemory(userId, 
        `用户平均在${avgCompletionDays}天内完成任务,显示出稳定的执行力`, 
        {
          category: 'task_planning',
          metadata: { source: 'historical_analysis', type: 'completion_speed' }
        }
      )
      memoryCount++
    }
    
    // 3. 存储所有笔记内容为独立记忆
    const notes = db.prepare(`
      SELECT id, content, tags, created_at 
      FROM notes 
      WHERE created_at >= date('now', '-90 days')
      AND length(content) > 20
      ORDER BY created_at DESC
    `).all()
    
    console.log(`[Mem0] 找到 ${notes.length} 篇笔记,开始存储完整内容...`)
    
    // 将每条笔记的完整内容存储为独立记忆
    for (const note of notes) {
      try {
        // 存储完整笔记内容
        const fullContent = note.content.trim()
        
        console.log(`[Mem0] 处理笔记 ${note.id}, 长度: ${fullContent.length} 字符`)
        
        // 提取标签
        const tags = note.tags ? note.tags.split(',').map(t => t.trim()).filter(t => t) : []
        
        // 使用 'knowledge' category 表示这是知识内容
        const memoryId = await services.mem0Service.addMemory(userId, 
          fullContent, 
          {
            category: 'knowledge',
            metadata: { 
              source: 'user_note',
              note_id: note.id,
              created_at: note.created_at,
              tags: tags,
              content_length: fullContent.length
            }
          }
        )
        
        console.log(`[Mem0] 笔记 ${note.id} 存储成功, memory_id: ${memoryId}`)
        memoryCount++
        
        // 每处理50条打印一次进度
        if (memoryCount % 50 === 0) {
          console.log(`[Mem0] 已处理 ${memoryCount} 条笔记...`)
        }
      } catch (err) {
        console.error(`[Mem0] 存储笔记 ${note.id} 失败:`, err.message)
      }
    }
    
    console.log(`[Mem0] 笔记存储完成,共 ${notes.length} 条`)
    
    // 额外统计信息
    if (notes.length > 20) {
      const notesPerWeek = (notes.length / 13).toFixed(1)
      await services.mem0Service.addMemory(userId, 
        `用户保持着良好的笔记习惯,平均每周记录${notesPerWeek}篇笔记`, 
        {
          category: 'note_taking',
          metadata: { source: 'historical_analysis', type: 'note_frequency' }
        }
      )
      memoryCount++
    }
    
    console.log(`[Mem0] 历史数据分析完成,添加了 ${memoryCount} 条记忆`)
    
    return { success: true, memoryCount }
  } catch (error) {
    console.error('[Mem0] 分析历史数据失败:', error)
    return { success: false, error: error.message }
  }
})

// 云同步相关IPC处理
ipcMain.handle('sync:get-available-services', async (event) => {
  try {
    return services.cloudSyncManager.getAvailableServices()
  } catch (error) {
    console.error('获取可用同步服务失败:', error)
    return []
  }
})

ipcMain.handle('sync:get-status', async (event) => {
  try {
    return services.cloudSyncManager.getStatus()
  } catch (error) {
    console.error('获取同步状态失败:', error)
    return { hasActiveService: false, activeService: null, status: null }
  }
})

ipcMain.handle('sync:test-connection', async (event, serviceName, config) => {
  try {
    return await services.cloudSyncManager.testConnection(serviceName, config)
  } catch (error) {
    console.error('测试同步连接失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('sync:switch-service', async (event, serviceName, config) => {
  try {
    return await services.cloudSyncManager.switchToService(serviceName, config)
  } catch (error) {
    console.error('切换同步服务失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('sync:disable', async (event) => {
  try {
    await services.cloudSyncManager.disableCurrentService()
    return { success: true, message: '云同步已禁用' }
  } catch (error) {
    console.error('禁用云同步失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('sync:manual-sync', async (event) => {
  try {
    return await services.cloudSyncManager.sync()
  } catch (error) {
    console.error('手动同步失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('sync:force-stop', async (event) => {
  try {
    await services.cloudSyncManager.forceStopSync()
    return { success: true, message: '同步已强制停止' }
  } catch (error) {
    console.error('强制停止同步失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('sync:get-conflicts', async (event) => {
  try {
    return services.cloudSyncManager.getConflicts()
  } catch (error) {
    console.error('获取冲突列表失败:', error)
    return []
  }
})

ipcMain.handle('sync:resolve-conflict', async (event, conflictId, resolution) => {
  try {
    await services.cloudSyncManager.resolveConflict(conflictId, resolution)
    return { success: true, message: '冲突已解决' }
  } catch (error) {
    console.error('解决冲突失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('sync:export-data', async (event, filePath) => {
  try {
    await services.cloudSyncManager.exportData(filePath)
    return { success: true, message: '数据导出成功' }
  } catch (error) {
    console.error('导出数据失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('sync:import-data', async (event, filePath) => {
  try {
    await services.cloudSyncManager.importData(filePath)
    return { success: true, message: '数据导入成功' }
  } catch (error) {
    console.error('导入数据失败:', error)
    return { success: false, message: error.message }
  }
})

// 版本管理IPC处理器
ipcMain.handle('version:create-manual', async (event, description) => {
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService) {
      return { success: false, message: '没有启用的同步服务' }
    }
    const result = await activeService.createManualVersion(description)
    return { success: true, data: result }
  } catch (error) {
    console.error('创建手动版本失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('version:get-list', async (event) => {
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService) {
      return { success: false, message: '没有启用的同步服务' }
    }
    const versions = await activeService.getVersionList()
    return { success: true, data: versions }
  } catch (error) {
    console.error('获取版本列表失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('version:restore', async (event, fileName) => {
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService) {
      return { success: false, message: '没有启用的同步服务' }
    }
    await activeService.restoreToVersion(fileName)
    return { success: true, message: '版本恢复成功' }
  } catch (error) {
    console.error('版本恢复失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('version:delete', async (event, fileName) => {
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService) {
      return { success: false, message: '没有启用的同步服务' }
    }
    await activeService.deleteVersion(fileName)
    return { success: true, message: '版本删除成功' }
  } catch (error) {
    console.error('删除版本失败:', error)
    return { success: false, message: error.message }
  }
})

ipcMain.handle('version:get-details', async (event, fileName) => {
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService) {
      return { success: false, message: '没有启用的同步服务' }
    }
    const details = await activeService.getVersionDetails(fileName)
    return { success: true, data: details }
  } catch (error) {
    console.error('获取版本详情失败:', error)
    return { success: false, message: error.message }
  }
})

// 窗口管理IPC处理
ipcMain.handle('window:minimize', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.minimize()
  return true
})

ipcMain.handle('window:maximize', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  }
  return true
})

ipcMain.handle('window:close', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.close()
  return true
})

ipcMain.handle('window:hide', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.hide()
  return true
})

ipcMain.handle('window:show', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.show()
  return true
})

ipcMain.handle('window:focus', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.focus()
  return true
})

ipcMain.handle('window:is-maximized', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? window.isMaximized() : false
})

ipcMain.handle('window:is-minimized', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? window.isMinimized() : false
})

ipcMain.handle('window:is-visible', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? window.isVisible() : false
})

ipcMain.handle('window:is-focused', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? window.isFocused() : false
})

ipcMain.handle('window:get-bounds', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? window.getBounds() : null
})

ipcMain.handle('window:set-bounds', async (event, bounds) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.setBounds(bounds)
  return true
})

ipcMain.handle('window:get-size', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? window.getSize() : null
})

ipcMain.handle('window:set-size', async (event, width, height) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.setSize(width, height)
  return true
})

ipcMain.handle('window:get-position', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? window.getPosition() : null
})

ipcMain.handle('window:set-position', async (event, x, y) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) window.setPosition(x, y)
  return true
})

ipcMain.handle('window:create-floating-ball', async (event) => {
  return await windowManager.createFloatingBall()
})

ipcMain.handle('window:create-note-window', async (event, noteId) => {
  return await windowManager.createNoteWindow(noteId)
})

ipcMain.handle('window:is-note-open', async (event, noteId) => {
  try {
    const isOpen = windowManager.isNoteOpenInWindow(noteId)
    return { success: true, isOpen }
  } catch (error) {
    console.error('检查笔记窗口状态失败:', error)
    return { success: false, error: error.message, isOpen: false }
  }
})

ipcMain.handle('window:create-todo-window', async (event, todoListId) => {
  return await windowManager.createTodoWindow(todoListId)
})

ipcMain.handle('window:get-all', async (event) => {
  return windowManager.getAllWindows()
})

ipcMain.handle('window:get-by-id', async (event, id) => {
  return windowManager.getWindowById(id)
})

ipcMain.handle('window:close-window', async (event, id) => {
  return windowManager.closeWindow(id)
})

ipcMain.handle('window:ready', async (event) => {
  const webContents = event.sender
  const window = BrowserWindow.fromWebContents(webContents)
  if (window) {
    console.log('收到窗口准备就绪通知，触发ready-to-show事件')
    window.emit('ready-to-show')
  }
})

// 系统相关IPC处理
ipcMain.handle('system:get-platform', async (event) => {
  return process.platform
})

ipcMain.handle('system:get-version', async (event) => {
  return app.getVersion()
})

ipcMain.handle('system:get-path', async (event, name) => {
  return app.getPath(name)
})

ipcMain.handle('system:show-open-dialog', async (event, options) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return await dialog.showOpenDialog(window, options)
})

ipcMain.handle('system:show-save-dialog', async (event, options) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return await dialog.showSaveDialog(window, options)
})

ipcMain.handle('system:show-message-box', async (event, options) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  return await dialog.showMessageBox(window, options)
})

ipcMain.handle('system:write-text', async (event, text) => {
  clipboard.writeText(text)
  return true
})

ipcMain.handle('system:read-text', async (event) => {
  return clipboard.readText()
})

ipcMain.handle('system:show-notification', async (event, options) => {
  const notification = new Notification(options)
  notification.show()
  return { success: true }
})



// 打开数据文件夹
ipcMain.handle('system:open-data-folder', async (event) => {
  try {
    const dbManager = DatabaseManager.getInstance()
    const dbPath = dbManager.getDatabasePath()
    const dbDir = path.dirname(dbPath)
    
    await shell.openPath(dbDir)
    return { success: true }
  } catch (error) {
    console.error('打开数据文件夹失败:', error)
    return { success: false, error: error.message }
  }
})

// 打开外部链接
ipcMain.handle('system:open-external', async (event, url) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    console.error('打开外部链接失败:', error)
    return { success: false, error: error.message }
  }
})

// 悬浮球相关IPC处理
ipcMain.handle('floating-ball:create', async (event) => {
  try {
    await windowManager.createFloatingBall()
    return { success: true }
  } catch (error) {
    console.error('创建悬浮球失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('floating-ball:hide', async (event) => {
  try {
    if (windowManager.floatingBall) {
      windowManager.floatingBall.hide()
    }
    return { success: true }
  } catch (error) {
    console.error('隐藏悬浮球失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('floating-ball:show', async (event) => {
  try {
    if (windowManager.floatingBall) {
      windowManager.floatingBall.show()
    }
    return { success: true }
  } catch (error) {
    console.error('显示悬浮球失败:', error)
    return { success: false, error: error.message }
  }
})

// 读取图片文件并转换为base64
ipcMain.handle('system:read-image-as-base64', async (event, filePath) => {
  try {
    const imageData = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase().substring(1)
    const mimeType = {
      'jpg': 'jpeg',
      'jpeg': 'jpeg',
      'png': 'png',
      'gif': 'gif',
      'bmp': 'bmp',
      'webp': 'webp'
    }[ext] || 'jpeg'
    
    const base64Image = `data:image/${mimeType};base64,${imageData.toString('base64')}`
    return base64Image
  } catch (error) {
    console.error('读取图片文件失败:', error)
    throw new Error('读取图片文件失败: ' + error.message)
  }
})

// 标签相关IPC处理
ipcMain.handle('tag:get-all', async (event, options) => {
  return await services.tagService.getAllTags(options)
})

ipcMain.handle('tag:search', async (event, query, limit) => {
  return await services.tagService.searchTags(query, limit)
})

ipcMain.handle('tag:get-suggestions', async (event, input, limit) => {
  return await services.tagService.getTagSuggestions(input, limit)
})

ipcMain.handle('tag:get-popular', async (event, limit) => {
  return await services.tagService.getAllTags({ limit, orderBy: 'usage_count', order: 'DESC' })
})

ipcMain.handle('tags:getPopular', async (event, limit) => {
    return await services.tagService.getPopularTags(limit);
  });

ipcMain.handle('tag:get-stats', async (event) => {
  return await services.tagService.getTagStats()
})

ipcMain.handle('tag:delete', async (event, tagName) => {
  return await services.tagService.deleteTag(tagName)
})

ipcMain.handle('tag:cleanup', async (event) => {
  return await services.tagService.cleanupUnusedTags()
})

ipcMain.handle('tag:recalculate-usage', async (event) => {
  return await services.tagService.recalculateTagUsage()
})

ipcMain.handle('tag:batch-delete', async (event, tagNames) => {
  const results = [];
  for (const tagName of tagNames) {
    const result = await services.tagService.deleteTag(tagName);
    results.push(result);
  }
  return { success: true, data: results };
})

// 快捷键相关的IPC处理程序
ipcMain.handle('shortcut:update', async (event, shortcutId, newShortcut, action) => {
  try {
    if (!shortcutService) {
      throw new Error('快捷键服务未初始化')
    }
    
    const result = await shortcutService.updateShortcut(shortcutId, newShortcut, action)
    return { success: true, data: result }
  } catch (error) {
    console.error('更新快捷键失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('shortcut:reset', async (event, shortcutId) => {
  try {
    if (!shortcutService) {
      throw new Error('快捷键服务未初始化')
    }
    
    const result = await shortcutService.resetShortcut(shortcutId)
    return { success: true, data: result }
  } catch (error) {
    console.error('重置快捷键失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('shortcut:reset-all', async (event) => {
  try {
    if (!shortcutService) {
      throw new Error('快捷键服务未初始化')
    }
    
    const result = await shortcutService.resetAllShortcuts()
    return { success: true, data: result }
  } catch (error) {
    console.error('重置所有快捷键失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('shortcut:get-all', async (event) => {
  try {
    if (!shortcutService) {
      throw new Error('快捷键服务未初始化')
    }
    
    const shortcuts = await shortcutService.getAllShortcuts()
    return { success: true, data: shortcuts }
  } catch (error) {
    console.error('获取快捷键配置失败:', error)
    return { success: false, error: error.message }
  }
})

// 图片相关 IPC 处理器
ipcMain.handle('image:save-from-buffer', async (event, buffer, fileName) => {
  try {
    const imagePath = await services.imageService.saveImage(Buffer.from(buffer), fileName)
    return { success: true, data: imagePath }
  } catch (error) {
    console.error('保存图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('image:save-from-path', async (event, sourcePath, fileName) => {
  try {
    const imagePath = await services.imageService.saveImageFromPath(sourcePath, fileName)
    return { success: true, data: imagePath }
  } catch (error) {
    console.error('从路径保存图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('image:select-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择图片',
      properties: ['openFile'],
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    
    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: '用户取消选择' }
    }
    
    const filePath = result.filePaths[0]
    const fileName = path.basename(filePath)
    
    if (!services.imageService.isSupportedImageType(fileName)) {
      return { success: false, error: '不支持的图片格式' }
    }
    
    const imagePath = await services.imageService.saveImageFromPath(filePath, fileName)
    return { success: true, data: { imagePath, fileName } }
  } catch (error) {
    console.error('选择图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('image:get-path', async (event, relativePath) => {
  try {
    const fullPath = services.imageService.getImagePath(relativePath)
    const fs = require('fs')
    
    // 检查文件是否存在
    if (fs.existsSync(fullPath)) {
      return { success: true, data: fullPath }
    } else {
      return { success: false, error: '图片文件不存在' }
    }
  } catch (error) {
    console.error('获取图片路径失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('image:get-base64', async (event, relativePath) => {
  try {
    const base64Data = await services.imageService.getBase64(relativePath)
    return { success: true, data: base64Data }
  } catch (error) {
    console.error('获取图片base64失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('image:delete', async (event, relativePath) => {
  try {
    const result = await services.imageService.deleteImage(relativePath)
    return { success: true, data: result }
  } catch (error) {
    console.error('删除图片失败:', error)
    return { success: false, error: error.message }
  }
})

// 白板图片存储 IPC 处理器
ipcMain.handle('whiteboard:save-images', async (event, files) => {
  try {
    const imageStorage = getImageStorageInstance()
    const fileMap = await imageStorage.saveWhiteboardImages(files)
    return { success: true, data: fileMap }
  } catch (error) {
    console.error('保存白板图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('whiteboard:load-images', async (event, fileMap) => {
  try {
    const imageStorage = getImageStorageInstance()
    const files = await imageStorage.loadWhiteboardImages(fileMap)
    return { success: true, data: files }
  } catch (error) {
    console.error('加载白板图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('whiteboard:delete-images', async (event, fileMap) => {
  try {
    const imageStorage = getImageStorageInstance()
    await imageStorage.deleteWhiteboardImages(fileMap)
    return { success: true }
  } catch (error) {
    console.error('删除白板图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('whiteboard:get-storage-stats', async () => {
  try {
    const imageStorage = getImageStorageInstance()
    const stats = await imageStorage.getStorageStats()
    return { success: true, data: stats }
  } catch (error) {
    console.error('获取存储统计失败:', error)
    return { success: false, error: error.message }
  }
})

// 图片云同步相关 IPC 处理器
ipcMain.handle('sync:download-image', async (event, relativePath) => {
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService || !activeService.downloadImage) {
      return { success: false, error: '云同步服务未启用或不支持图片同步' }
    }
    
    const localPath = path.join(
      relativePath.startsWith('images/whiteboard/')
        ? path.join(app.getPath('userData'), 'images', 'whiteboard')
        : path.join(app.getPath('userData'), 'images'),
      path.basename(relativePath)
    )
    
    await activeService.downloadImage(relativePath, localPath)
    return { success: true }
  } catch (error) {
    console.error('下载图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('sync:upload-image', async (event, localPath, relativePath) => {
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService || !activeService.uploadImage) {
      return { success: false, error: '云同步服务未启用或不支持图片同步' }
    }
    
    const appUrl = await activeService.uploadImage(localPath, relativePath)
    return { success: true, data: appUrl }
  } catch (error) {
    console.error('上传图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('sync:sync-images', async () => {
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService || !activeService.syncImagesOnly) {
      return { success: false, error: '云同步服务未启用或不支持图片同步' }
    }
    
    const result = await activeService.syncImagesOnly()
    return { success: true, data: result }
  } catch (error) {
    console.error('同步图片失败:', error)
    return { success: false, error: error.message }
  }
})

// 清理未引用的图片
ipcMain.handle('sync:cleanup-unused-images', async (event, retentionDays = 30) => {
  console.log('[Main] 收到清理图片请求, retentionDays:', retentionDays);
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    console.log('[Main] activeService:', !!activeService);
    console.log('[Main] imageSync:', !!activeService?.imageSync);
    
    if (!activeService || !activeService.imageSync) {
      console.log('[Main] 云同步服务未启用');
      return { success: false, error: '云同步服务未启用或不支持图片清理' }
    }
    
    console.log('[Main] 开始调用 cleanupUnusedImages...');
    const result = await activeService.imageSync.cleanupUnusedImages(retentionDays)
    console.log('[Main] cleanupUnusedImages 完成, result:', result);
    return { success: true, data: result }
  } catch (error) {
    console.error('[Main] 清理图片失败:', error)
    return { success: false, error: error.message }
  }
})

// 获取未引用图片的统计信息
ipcMain.handle('sync:get-unused-images-stats', async (event, retentionDays = 30) => {
  console.log('[Main] 收到获取统计信息请求, retentionDays:', retentionDays);
  try {
    const activeService = services.cloudSyncManager.getActiveService()
    if (!activeService || !activeService.imageSync) {
      return { success: false, error: '云同步服务未启用' }
    }
    
    // 获取未引用图片列表（但不删除）
    const referencedImages = await activeService.imageSync.scanActiveNoteReferences()
    const localImages = await activeService.imageSync.scanLocalImages(false)  // 不需要 hash，加快速度
    
    console.log('[Main] 引用图片数:', referencedImages.size);
    console.log('[Main] 本地图片数:', localImages.length);
    
    const now = Date.now()
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000
    
    let orphanedCount = 0
    let totalSize = 0
    let skippedByReference = 0
    let skippedByAge = 0
    
    for (const image of localImages) {
      // 使用与 cleanupUnusedImages 相同的匹配逻辑
      const relativePath = image.relativePath;
      
      const pathVariants = [
        relativePath,
        relativePath.replace(/^images\//, ''),
        relativePath.replace(/^images\/whiteboard\//, 'whiteboard/'),
        image.fileName
      ];
      
      const isReferenced = pathVariants.some(variant => referencedImages.has(variant));
      
      if (isReferenced) {
        skippedByReference++;
        continue;
      }
      
      const mtime = new Date(image.mtime).getTime();
      const fileAge = now - mtime;
      const fileAgeDays = Math.floor(fileAge / 86400000);
      
      if (fileAge <= retentionMs) {
        skippedByAge++;
        continue;
      }
      
      orphanedCount++;
      totalSize += image.size;
      if (orphanedCount <= 5) {
        console.log(`[Main] 孤立图片: ${relativePath}, 年龄: ${fileAgeDays}天`);
      }
    }
    
    console.log(`[Main] 统计: 总计=${localImages.length}, 被引用=${skippedByReference}, 太新=${skippedByAge}, 孤立=${orphanedCount}, 总大小=${totalSize}`);
    
    return { 
      success: true, 
      data: { 
        orphanedCount, 
        totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
      } 
    }
  } catch (error) {
    console.error('获取图片统计失败:', error)
    return { success: false, error: error.message }
  }
})

// 应用退出时清理资源
app.on('before-quit', async () => {
  try {
    // 关闭数据库连接
    const dbManager = DatabaseManager.getInstance()
    await dbManager.close()
    console.log('应用资源清理完成')
  } catch (error) {
    console.error('应用退出清理失败:', error)
  }
})