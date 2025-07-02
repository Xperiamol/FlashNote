const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const notesFile = path.join(__dirname, 'notes.json');
const settingsFile = path.join(__dirname, 'settings.json');

// 读取设置
function readSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to read settings file:', error);
  }
  // 默认设置
  return { alwaysOnTop: true, openAtLogin: false, restoreWindows: false };
}

// 写入设置
function writeSettings(settings) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write settings file:', error);
  }
}

let mainWin = null;
let tray = null;

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
    app.setLoginItemSettings({
      openAtLogin: settings.openAtLogin,
      path: app.getPath('exe'),
    });
  });

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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      spellcheck: false,

    }
  });

  if (app.isPackaged) {
    mainWin.loadFile(path.join(__dirname, 'renderer', 'build', 'index.html'));
  } else {
    mainWin.loadURL('http://localhost:3000');
  }
}

// 在应用准备就绪时注册 IPC 处理程序并创建窗口
app.whenReady().then(() => {
  createWindow();

  const iconPath = path.join(__dirname, 'renderer', 'public', 'favicon.ico');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
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

  // 根据设置初始化开机自启
  app.setLoginItemSettings({
    openAtLogin: settings.openAtLogin,
    path: app.getPath('exe'),
  });

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
