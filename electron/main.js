const { app, BrowserWindow, ipcMain, dialog, clipboard, Notification, shell, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

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

// 保持对窗口对象的全局引用，如果不这样做，当JavaScript对象被垃圾回收时，窗口将自动关闭
let mainWindow
let services = {}
let windowManager
let shortcutService
let tray = null

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
    tray.setToolTip('FlashNote 2.0 - 快速笔记应用')
    
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
        click: () => {
          // TODO: 实现快速输入窗口
          console.log('快速输入功能待实现')
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
    
    // 初始化通知服务
    services.notificationService = new NotificationService()
    
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

    // 检查是否为首次启动，如果没有笔记则创建示例笔记
    try {
      const notesResult = await services.noteService.getNotes({ limit: 1 })
      if (notesResult.success && notesResult.data && notesResult.data.notes && notesResult.data.notes.length === 0) {
        console.log('检测到首次启动，创建示例笔记')
        const welcomeNote = {
          title: '欢迎使用 FlashNote 2.0！',
          content: `# 欢迎使用 FlashNote 2.0！ 🎉

恭喜你成功安装了 FlashNote 2.0，这是一个现代化的本地笔记应用。

## 快速开始

### 基本操作
- **创建笔记**：点击左上角的 "新建" 按钮或使用快捷键 \`Ctrl+N\`
- **搜索笔记**：使用顶部搜索框快速找到你需要的笔记
- **标签管理**：为笔记添加标签，方便分类和查找
- **拖拽窗口**：试试拖动笔记列表到窗口外~


### 快捷键
- \`Ctrl+N\`：新建笔记
- \`Ctrl+S\`：保存笔记
- \`Ctrl+F\`：搜索笔记
- \`Ctrl+Shift+N\`：快速输入（开发中）

## 特色功能

### Markdown 支持
这个笔记应用支持 **Markdown** 语法，你可以：

- 使用 **粗体** 和 *斜体*
- 创建 [链接](https://github.com)
- 添加代码块：

\`\`\`javascript
console.log('Hello, FlashNote!');
\`\`\`

- 制作任务列表：
  - [x] 安装 FlashNote
  - [x] 阅读欢迎笔记
  - [ ] 创建第一个笔记
  - [ ] 探索更多功能

### 数据安全
- 所有数据都存储在本地，保护你的隐私
- 支持数据导入导出功能
- 自动保存，不用担心数据丢失

## 开始使用

现在你可以：
1. 删除这个示例笔记（如果不需要的话）
2. 创建你的第一个笔记
3. 探索设置选项，个性化你的使用体验

祝你使用愉快！ 📝✨`,
          tags: ['欢迎', '教程'],
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
  await initializeServices()
  createWindow()
  createTray()
  
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
  
  // 设置快捷键服务的主窗口引用
  if (shortcutService && mainWindow) {
    shortcutService.setMainWindow(mainWindow)
    
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

// 数据库调试相关（用于排查持久化问题）
ipcMain.handle('db:get-info', async () => {
  try {
    const dbManager = DatabaseManager.getInstance()
    return dbManager.getInfo()
  } catch (err) {
    return { error: err?.message || 'unknown error' }
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