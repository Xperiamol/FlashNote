const { contextBridge, ipcRenderer } = require('electron')

// 暴露受保护的方法给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用信息
  getVersion: () => ipcRenderer.invoke('app-version'),
  
  // 测试用的Hello World
  helloWorld: () => ipcRenderer.invoke('hello-world'),
  
  // 笔记相关API
  notes: {
    // 创建笔记
    create: (noteData) => ipcRenderer.invoke('note:create', noteData),
    
    // 获取笔记
    getById: (id) => ipcRenderer.invoke('note:get-by-id', id),
    getAll: (options) => ipcRenderer.invoke('note:get-all', options),
    getPinned: () => ipcRenderer.invoke('note:get-pinned'),
    getDeleted: () => ipcRenderer.invoke('note:get-deleted'),
    getRecentlyModified: (limit) => ipcRenderer.invoke('note:get-recently-modified', limit),
    
    // 更新笔记
    update: (id, updates) => ipcRenderer.invoke('note:update', id, updates),
    autoSave: (id, content) => ipcRenderer.invoke('note:auto-save', id, content),
    
    // 删除和恢复笔记
    delete: (id) => ipcRenderer.invoke('note:delete', id),
    restore: (id) => ipcRenderer.invoke('note:restore', id),
    permanentDelete: (id) => ipcRenderer.invoke('note:permanent-delete', id),
    
    // 置顶操作
    togglePin: (id) => ipcRenderer.invoke('note:toggle-pin', id),
    
    // 搜索笔记
    search: (query, options) => ipcRenderer.invoke('note:search', query, options),
    
    // 批量操作
    batchUpdate: (ids, updates) => ipcRenderer.invoke('note:batch-update', ids, updates),
    batchDelete: (ids) => ipcRenderer.invoke('note:batch-delete', ids),
    batchRestore: (ids) => ipcRenderer.invoke('note:batch-restore', ids),
    batchPermanentDelete: (ids) => ipcRenderer.invoke('note:batch-permanent-delete', ids),
    batchSetTags: (params) => ipcRenderer.invoke('note:batch-set-tags', params),
    
    // 获取统计信息
    getStats: () => ipcRenderer.invoke('note:get-stats'),
    
    // 导出导入
    export: (options) => ipcRenderer.invoke('note:export', options),
    import: (data) => ipcRenderer.invoke('note:import', data),
    
    // 事件监听
    onNoteCreated: (callback) => {
      ipcRenderer.on('note:created', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('note:created');
    },
    onNoteUpdated: (callback) => {
      ipcRenderer.on('note:updated', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('note:updated');
    },
    onNoteDeleted: (callback) => {
      ipcRenderer.on('note:deleted', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('note:deleted');
    }
  },

  // 标签相关API
  tags: {
    // 获取所有标签
    getAll: (options) => ipcRenderer.invoke('tag:get-all', options),
    
    // 获取热门标签
     getPopular: (limit) => ipcRenderer.invoke('tags:getPopular', limit),
    
    // 搜索标签
    search: (query, limit) => ipcRenderer.invoke('tag:search', query, limit),
    
    // 获取标签建议
    getSuggestions: (input, limit) => ipcRenderer.invoke('tag:get-suggestions', input, limit),
    
    // 获取标签统计
    getStats: () => ipcRenderer.invoke('tag:get-stats'),
    
    // 删除标签
    delete: (tagName) => ipcRenderer.invoke('tag:delete', tagName),
    
    // 清理未使用的标签
    cleanup: () => ipcRenderer.invoke('tag:cleanup'),
    
    // 重新计算标签使用次数
    recalculateUsage: () => ipcRenderer.invoke('tag:recalculate-usage'),
    
    // 批量操作
    batchDelete: (tagNames) => ipcRenderer.invoke('tag:batch-delete', tagNames)
  },

  // 待办事项相关API
  todos: {
    // 创建待办事项
    create: (todoData) => ipcRenderer.invoke('todo:create', todoData),
    
    // 获取待办事项
    getAll: (options) => ipcRenderer.invoke('todo:getAll', options),
    getByQuadrant: (includeCompleted) => ipcRenderer.invoke('todo:getByQuadrant', includeCompleted),
    getDueToday: () => ipcRenderer.invoke('todo:getDueToday'),
    getOverdue: () => ipcRenderer.invoke('todo:getOverdue'),
    
    // 更新待办事项
    update: (id, todoData) => ipcRenderer.invoke('todo:update', id, todoData),
    toggleComplete: (id) => ipcRenderer.invoke('todo:toggleComplete', id),
    
    // 删除待办事项
    delete: (id) => ipcRenderer.invoke('todo:delete', id),
    
    // 搜索和排序
    search: (query) => ipcRenderer.invoke('todo:search', query),
    getByPriority: () => ipcRenderer.invoke('todo:getByPriority'),
    getByDueDate: () => ipcRenderer.invoke('todo:getByDueDate'),
    getByCreatedAt: () => ipcRenderer.invoke('todo:getByCreatedAt'),
    
    // 批量操作
    batchUpdate: (updates) => ipcRenderer.invoke('todo:batchUpdate', updates),
    batchDelete: (ids) => ipcRenderer.invoke('todo:batchDelete', ids),
    batchComplete: (ids) => ipcRenderer.invoke('todo:batchComplete', ids),
    
    // 获取统计信息
    getStats: () => ipcRenderer.invoke('todo:getStats'),
    getPriorityStats: () => ipcRenderer.invoke('todo:getPriorityStats'),
    getTodoTagStats: () => ipcRenderer.invoke('todo:getTodoTagStats'),
    getTagSuggestions: (query) => ipcRenderer.invoke('todo:getTagSuggestions', query),
    searchTags: (query) => ipcRenderer.invoke('todo:searchTags', query)
  },

  // 设置相关API
  settings: {
    // 获取设置
    get: (key) => ipcRenderer.invoke('setting:get', key),
    getMultiple: (keys) => ipcRenderer.invoke('setting:get-multiple', keys),
    getAll: () => ipcRenderer.invoke('setting:get-all'),
    getByType: (type) => ipcRenderer.invoke('setting:get-by-type', type),
    getThemeSettings: () => ipcRenderer.invoke('setting:get-theme'),
    getWindowSettings: () => ipcRenderer.invoke('setting:get-window'),
    getEditorSettings: () => ipcRenderer.invoke('setting:get-editor'),
    
    // 设置设置
    set: (key, value) => ipcRenderer.invoke('setting:set', key, value),
    setMultiple: (settings) => ipcRenderer.invoke('setting:set-multiple', settings),
    
    // 删除设置
    delete: (key) => ipcRenderer.invoke('setting:delete', key),
    deleteMultiple: (keys) => ipcRenderer.invoke('setting:delete-multiple', keys),
    
    // 重置设置
    reset: (key) => ipcRenderer.invoke('setting:reset', key),
    resetAll: () => ipcRenderer.invoke('setting:reset-all'),
    
    // 搜索设置
    search: (query) => ipcRenderer.invoke('setting:search', query),
    
    // 获取统计信息
    getStats: () => ipcRenderer.invoke('setting:get-stats'),
    
    // 导出导入
    export: () => ipcRenderer.invoke('setting:export'),
    import: (data) => ipcRenderer.invoke('setting:import', data),
    
    // 壁纸选择
    selectWallpaper: () => ipcRenderer.invoke('setting:select-wallpaper'),
    
    // 开机自启
    setAutoLaunch: (enabled) => ipcRenderer.invoke('setting:set-auto-launch', enabled),
    getAutoLaunch: () => ipcRenderer.invoke('setting:get-auto-launch'),
    
    // 事件监听
    onSettingChanged: (callback) => {
      ipcRenderer.on('setting:changed', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('setting:changed');
    }
  },
  
  // 数据导入导出API
  dataImport: {
    // 文件选择
    selectFile: () => ipcRenderer.invoke('data:select-file'),
    
    // 导出数据
    exportNotes: (options) => ipcRenderer.invoke('data:export-notes', options),
    exportSettings: (filePath) => ipcRenderer.invoke('data:export-settings', filePath),
    
    // 导入数据
    importNotes: (options) => ipcRenderer.invoke('data:import-notes', options),
    importSettings: (filePath) => ipcRenderer.invoke('data:import-settings', filePath),
    importFolder: () => ipcRenderer.invoke('data:import-folder'),
    
    // 获取支持的格式
    getSupportedFormats: () => ipcRenderer.invoke('data:get-supported-formats'),
    getStats: () => ipcRenderer.invoke('data:get-stats'),
    
    // 事件监听
    onNotesExported: (callback) => {
      ipcRenderer.on('data:notes-exported', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('data:notes-exported');
    },
    onNotesImported: (callback) => {
      ipcRenderer.on('data:notes-imported', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('data:notes-imported');
    },
    onSettingsExported: (callback) => {
      ipcRenderer.on('data:settings-exported', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('data:settings-exported');
    },
    onSettingsImported: (callback) => {
      ipcRenderer.on('data:settings-imported', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('data:settings-imported');
    },
    onFolderImported: (callback) => {
      ipcRenderer.on('data:folder-imported', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('data:folder-imported');
    }
  },
  
  // 窗口管理API
  window: {
    // 窗口控制
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    hide: () => ipcRenderer.invoke('window:hide'),
    show: () => ipcRenderer.invoke('window:show'),
    focus: () => ipcRenderer.invoke('window:focus'),
    
    // 窗口状态
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    isMinimized: () => ipcRenderer.invoke('window:is-minimized'),
    isVisible: () => ipcRenderer.invoke('window:is-visible'),
    isFocused: () => ipcRenderer.invoke('window:is-focused'),
    
    // 窗口大小和位置
    getBounds: () => ipcRenderer.invoke('window:get-bounds'),
    setBounds: (bounds) => ipcRenderer.invoke('window:set-bounds', bounds),
    getSize: () => ipcRenderer.invoke('window:get-size'),
    setSize: (width, height) => ipcRenderer.invoke('window:set-size', width, height),
    getPosition: () => ipcRenderer.invoke('window:get-position'),
    setPosition: (x, y) => ipcRenderer.invoke('window:set-position', x, y),
    
    // 特殊窗口
    createFloatingBall: () => ipcRenderer.invoke('window:create-floating-ball'),
    createNoteWindow: (noteId) => ipcRenderer.invoke('window:create-note-window', noteId),
    
    // 窗口管理
    getAllWindows: () => ipcRenderer.invoke('window:get-all'),
    getWindowById: (id) => ipcRenderer.invoke('window:get-by-id', id),
    closeWindow: (id) => ipcRenderer.invoke('window:close-window', id),
    
    // 事件监听
    onWindowStateChanged: (callback) => {
      ipcRenderer.on('window:state-changed', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('window:state-changed');
    },
    onWindowCreated: (callback) => {
      ipcRenderer.on('window:created', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('window:created');
    },
    onWindowClosed: (callback) => {
      ipcRenderer.on('window:closed', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('window:closed');
    }
  },
  
  // 系统相关API
  system: {
    // 获取系统信息
    getPlatform: () => ipcRenderer.invoke('system:get-platform'),
    getVersion: () => ipcRenderer.invoke('system:get-version'),
    getPath: (name) => ipcRenderer.invoke('system:get-path', name),
    
    // 文件系统操作
    showOpenDialog: (options) => ipcRenderer.invoke('system:show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('system:show-save-dialog', options),
    showMessageBox: (options) => ipcRenderer.invoke('system:show-message-box', options),
    openDataFolder: () => ipcRenderer.invoke('system:open-data-folder'),
    readImageAsBase64: (filePath) => ipcRenderer.invoke('system:read-image-as-base64', filePath),
    
    // 剪贴板操作
    writeText: (text) => ipcRenderer.invoke('system:write-text', text),
    readText: () => ipcRenderer.invoke('system:read-text'),
    
    // 通知
    showNotification: (options) => ipcRenderer.invoke('system:show-notification', options),
    
    // 打开外部链接
    openExternal: (url) => ipcRenderer.invoke('system:open-external', url)
  },

  // 数据库调试
  db: {
    getInfo: () => ipcRenderer.invoke('db:get-info')
  },
  
  // 悬浮球相关API
  floatingBall: {
    create: () => ipcRenderer.invoke('floating-ball:create'),
    hide: () => ipcRenderer.invoke('floating-ball:hide'),
    show: () => ipcRenderer.invoke('floating-ball:show')
  },

  // 快捷键相关API
  shortcuts: {
    // 更新快捷键
    update: (shortcutId, newShortcut) => ipcRenderer.invoke('shortcut:update', shortcutId, newShortcut),
    
    // 重置单个快捷键
    reset: (shortcutId) => ipcRenderer.invoke('shortcut:reset', shortcutId),
    
    // 重置所有快捷键
    resetAll: () => ipcRenderer.invoke('shortcut:reset-all'),
    
    // 获取所有快捷键配置
    getAll: () => ipcRenderer.invoke('shortcut:get-all')
  },
  
  // 暴露 ipcRenderer 用于事件监听
  ipcRenderer: {
    on: (channel, callback) => {
      // 只允许特定的频道
      const validChannels = ['create-new-note', 'create-new-todo', 'open-settings', 'quick-input']
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, callback)
      }
    },
    removeAllListeners: (channel) => {
      const validChannels = ['create-new-note', 'create-new-todo', 'open-settings', 'quick-input']
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel)
      }
    }
  }
})

// 监听来自主进程的消息（如果需要的话）
// window.addEventListener('DOMContentLoaded', () => {
//   // DOM加载完成后的初始化代码
// })