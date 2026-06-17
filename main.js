const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const imageProcessor = require('./src/imageProcessor');

let mainWindow = null;

function getTemplatesDir() {
  const userDataPath = app.getPath('userData');
  const templatesDir = path.join(userDataPath, 'templates');
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  return templatesDir;
}

function getTemplatesFilePath() {
  return path.join(getTemplatesDir(), 'watermark-templates.json');
}

function readTemplates() {
  const filePath = getTemplatesFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) || [];
  } catch (err) {
    console.error('读取模板失败:', err);
    return [];
  }
}

function writeTemplates(templates) {
  const filePath = getTemplatesFilePath();
  fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), 'utf-8');
}

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

ipcMain.handle('check-path-type', async (event, fullPath) => {
  try {
    const stat = fs.statSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    return {
      path: fullPath,
      name: path.basename(fullPath),
      folder: path.dirname(fullPath),
      size: stat.size,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      extension: ext,
      isImage: ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.bmp'].includes(ext)
    };
  } catch (err) {
    return null;
  }
});

ipcMain.handle('parse-file-paths', async (event, filePaths) => {
  const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.bmp'];
  const results = [];
  const folders = [];

  for (const p of filePaths) {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        folders.push(p);
      } else if (stat.isFile()) {
        const ext = path.extname(p).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push({
            path: p,
            name: path.basename(p),
            folder: path.dirname(p),
            size: stat.size
          });
        }
      }
    } catch (err) {
      continue;
    }
  }

  let scanned = [];
  if (folders.length > 0) {
    scanned = await imageProcessor.scanImages(folders);
  }

  return scanned.concat(results);
});

ipcMain.handle('open-path', async (event, targetPath) => {
  if (targetPath && fs.existsSync(targetPath)) {
    const result = shell.openPath(targetPath);
    return result === '';
  }
  return false;
});

ipcMain.handle('basename', async (event, filePath) => {
  return path.basename(filePath);
});

ipcMain.handle('dirname', async (event, filePath) => {
  return path.dirname(filePath);
});

ipcMain.handle('extname', async (event, filePath) => {
  return path.extname(filePath);
});

ipcMain.handle('stat', async (event, filePath) => {
  try {
    const s = fs.statSync(filePath);
    return {
      size: s.size,
      isDirectory: s.isDirectory(),
      isFile: s.isFile(),
      mtime: s.mtime,
      birthtime: s.birthtime,
      mode: s.mode
    };
  } catch (err) {
    return null;
  }
});

ipcMain.handle('get-templates', async () => {
  return readTemplates();
});

ipcMain.handle('save-template', async (event, template) => {
  const templates = readTemplates();
  template.id = template.id || 'tpl_' + Date.now();
  template.createdAt = template.createdAt || new Date().toISOString();
  template.updatedAt = new Date().toISOString();

  const existingIndex = templates.findIndex(t => t.id === template.id);
  if (existingIndex >= 0) {
    templates[existingIndex] = { ...templates[existingIndex], ...template };
  } else {
    templates.push(template);
  }

  writeTemplates(templates);
  return template;
});

ipcMain.handle('delete-template', async (event, templateId) => {
  const templates = readTemplates();
  const filtered = templates.filter(t => t.id !== templateId);
  writeTemplates(filtered);
  return true;
});

ipcMain.handle('check-output-conflicts', async (event, files, outputDir, settings) => {
  return imageProcessor.checkOutputConflicts(files, outputDir, settings);
});

ipcMain.handle('get-folder-customer-name', async (event, folderPath) => {
  if (!folderPath) return null;
  const baseName = path.basename(folderPath);
  return baseName;
});

ipcMain.handle('preview-watermark-multi', async (event, imagePath, settings, positions) => {
  return imageProcessor.previewWatermarkMulti(imagePath, settings, positions);
});
