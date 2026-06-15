const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const imageProcessor = require('./src/imageProcessor');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: '照片版权水印批处理工具',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections']
  });
  return result.canceled ? null : result.filePaths;
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp', 'bmp'] }
    ]
  });
  return result.canceled ? null : result.filePaths;
});

ipcMain.handle('select-logo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Logo图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-output', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('scan-images', async (event, folderPaths) => {
  return imageProcessor.scanImages(folderPaths);
});

ipcMain.handle('get-thumbnail', async (event, imagePath, size) => {
  return imageProcessor.getThumbnail(imagePath, size);
});

ipcMain.handle('read-exif', async (event, imagePath) => {
  return imageProcessor.readExif(imagePath);
});

ipcMain.handle('preview-watermark', async (event, imagePath, settings) => {
  return imageProcessor.previewWatermark(imagePath, settings);
});

ipcMain.handle('start-batch-process', async (event, files, settings, outputDir) => {
  return imageProcessor.startBatchProcess(files, settings, outputDir, (progress) => {
    mainWindow.webContents.send('batch-progress', progress);
  });
});

ipcMain.handle('cancel-batch', async () => {
  return imageProcessor.cancelBatch();
});

ipcMain.handle('open-output-folder', async (event, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
    return true;
  }
  return false;
});

ipcMain.handle('show-notification', async (event, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    return true;
  }
  return false;
});

ipcMain.handle('get-image-info', async (event, imagePath) => {
  return imageProcessor.getImageInfo(imagePath);
});
