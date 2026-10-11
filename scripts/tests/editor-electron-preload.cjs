const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('acceptanceStorage', {
  saveImage: (bytes, name) => ipcRenderer.invoke('acceptance:image-save', bytes, name),
  readImage: relative => ipcRenderer.invoke('acceptance:image-read', relative),
  createNote: content => ipcRenderer.invoke('acceptance:note-create', content),
  readNote: id => ipcRenderer.invoke('acceptance:note-read', id),
  updateNote: (id, content) => ipcRenderer.invoke('acceptance:note-update', id, content),
})
