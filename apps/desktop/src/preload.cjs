const { contextBridge, ipcRenderer } = require('electron');

// Preload ikut dijalankan pada navigasi remote, tetapi bridge hanya ada di halaman lokal.
if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('desktop', {
    state: () => ipcRenderer.invoke('desktop:state'),
    save: (value) => ipcRenderer.invoke('desktop:save', value),
    cancel: () => ipcRenderer.invoke('desktop:cancel'),
    retry: () => ipcRenderer.invoke('desktop:retry'),
    settings: () => ipcRenderer.invoke('desktop:settings'),
    reset: () => ipcRenderer.invoke('desktop:reset'),
  });
}
