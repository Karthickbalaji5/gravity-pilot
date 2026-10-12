const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop'),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.invoke('window:setIgnoreMouseEvents', ignore, options),
  toggleClickThrough: () => ipcRenderer.invoke('window:toggleClickThrough'),
  getClickThrough: () => ipcRenderer.invoke('window:getClickThrough'),
  setWindowMode: (mode) => ipcRenderer.invoke('window:setMode', mode),
  startDrag: () => ipcRenderer.invoke('window:startDrag'),
  dragMove: (deltaX, deltaY) => ipcRenderer.invoke('window:dragMove', deltaX, deltaY),
  getQuietMode: () => ipcRenderer.invoke('window:getQuietMode'),
  setWindowSize: (w, h) => ipcRenderer.invoke('window:setSize', w, h),
  petMoveBy: (dx, dy) => ipcRenderer.invoke('pet:moveBy', dx, dy),
  getSystemIdleTime: () => ipcRenderer.invoke('pet:getSystemIdleTime'),
  openFile: (filePath) => ipcRenderer.invoke('shell:openFile', filePath),
  openOutputFolder: () => ipcRenderer.invoke('shell:openOutputFolder'),
  onLayoutChange: (callback) => {
    ipcRenderer.on('layout:change', (_event, mode) => callback(mode));
  },
  onClickThroughChange: (callback) => {
    ipcRenderer.on('companion:clickThrough', (_event, enabled) => callback(enabled));
  },
  onPushToTalk: (callback) => {
    let isPressed = false;
    ipcRenderer.on('voice:pushToTalk', () => {
      isPressed = !isPressed;
      callback(isPressed);
    });
  },
  onQuietModeChange: (callback) => {
    ipcRenderer.on('companion:quietMode', (_event, enabled) => callback(enabled));
  },
});
