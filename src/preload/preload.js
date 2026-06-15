const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectLogo: () => ipcRenderer.invoke('select-logo'),
  selectOutput: () => ipcRenderer.invoke('select-output'),
  scanImages: (folderPaths) => ipcRenderer.invoke('scan-images', folderPaths),
  getThumbnail: (imagePath, size) => ipcRenderer.invoke('get-thumbnail', imagePath, size),
  readExif: (imagePath) => ipcRenderer.invoke('read-exif', imagePath),
  previewWatermark: (imagePath, settings) => ipcRenderer.invoke('preview-watermark', imagePath, settings),
  startBatchProcess: (files, settings, outputDir) => ipcRenderer.invoke('start-batch-process', files, settings, outputDir),
  cancelBatch: () => ipcRenderer.invoke('cancel-batch'),
  openOutputFolder: (folderPath) => ipcRenderer.invoke('open-output-folder', folderPath),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
  getImageInfo: (imagePath) => ipcRenderer.invoke('get-image-info', imagePath),
  onBatchProgress: (callback) => {
    ipcRenderer.on('batch-progress', (event, data) => callback(data));
  },
  removeBatchProgressListener: () => {
    ipcRenderer.removeAllListeners('batch-progress');
  }
});
