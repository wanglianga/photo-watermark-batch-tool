const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const exifr = require('exifr');
const piexifjs = require('piexifjs');

let isCancelRequested = false;
let logFile = null;
let logStream = null;

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.bmp'];

function getOrientation(width, height) {
  if (width > height) return 'landscape';
  if (width < height) return 'portrait';
  return 'square';
}

function scanImages(folderPaths) {
  const images = [];
  const visitedDirs = new Set();

  function walkDir(dir) {
    if (visitedDirs.has(dir)) return;
    visitedDirs.add(dir);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          let stats;
          try {
            stats = fs.statSync(fullPath);
          } catch (err) {
            continue;
          }
          images.push({
            path: fullPath,
            name: entry.name,
            size: stats.size,
            folder: dir
          });
        }
      }
    }
  }

  for (const folderPath of folderPaths) {
    if (fs.statSync(folderPath).isDirectory()) {
      walkDir(folderPath);
    }
  }

  return images;
}

async function getThumbnail(imagePath, size = 200) {
  try {
    const buffer = await sharp(imagePath)
      .resize(size, size, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    return 'data:image/jpeg;base64,' + buffer.toString('base64');
  } catch (err) {
    return null;
  }
}

async function getImageInfo(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    const stats = fs.statSync(imagePath);
    return {
      path: imagePath,
      name: path.basename(imagePath),
      width: metadata.width,
      height: metadata.height,
      orientation: getOrientation(metadata.width, metadata.height),
      format: metadata.format,
      size: stats.size,
      sizeKB: (stats.size / 1024).toFixed(2),
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
    };
  } catch (err) {
    return null;
  }
}

async function readExif(imagePath) {
  try {
    const exifData = await exifr.parse(imagePath, {
      translateValues: true,
      reviveValues: true,
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: false,
      iptc: false
    });

    const result = {};
    if (exifData) {
      if (exifData.Make || exifData.Model) {
        result.camera = `${exifData.Make || ''} ${exifData.Model || ''}`.trim();
      }
      if (exifData.LensModel || exifData.LensMake) {
        result.lens = `${exifData.LensMake || ''} ${exifData.LensModel || ''}`.trim();
      }
      if (exifData.FNumber) {
        result.aperture = `f/${exifData.FNumber}`;
      }
      if (exifData.ExposureTime) {
        const et = exifData.ExposureTime;
        result.shutter = et < 1 ? `1/${Math.round(1 / et)}s` : `${et}s`;
      }
      if (exifData.ISO) {
        result.iso = `ISO ${exifData.ISO}`;
      }
      if (exifData.FocalLength) {
        result.focalLength = `${exifData.FocalLength}mm`;
      }
      if (exifData.DateTimeOriginal) {
        result.dateTime = exifData.DateTimeOriginal.toString();
      }
      if (exifData.Artist) {
        result.artist = exifData.Artist;
      }
      if (exifData.Copyright) {
        result.copyright = exifData.Copyright;
      }
      if (exifData.ImageDescription) {
        result.description = exifData.ImageDescription;
      }
      if (exifData.latitude && exifData.longitude) {
        result.gps = `${exifData.latitude.toFixed(4)}, ${exifData.longitude.toFixed(4)}`;
      }
      result.raw = {};
      const keys = Object.keys(exifData);
      for (const key of keys.slice(0, 50)) {
        if (typeof exifData[key] !== 'object' || exifData[key] === null) {
          result.raw[key] = String(exifData[key]).substring(0, 100);
        }
      }
    }
    return { hasExif: Object.keys(result).length > 0, data: result };
  } catch (err) {
    return { hasExif: false, data: {}, error: err.message };
  }
}

function removeExif(buffer, format) {
  if (format === 'jpeg' || format === 'jpg') {
    try {
      const zeroth = {};
      const exif = {};
      const gps = {};
      const first = {};
      const thumbnail = undefined;
      const newExifBytes = piexifjs.dump({ zeroth, exif, gps, first, thumbnail });
      return piexifjs.insert(newExifBytes, buffer.toString('binary'));
    } catch (err) {
      return buffer;
    }
  }
  return buffer;
}

function calculateWatermarkPosition(imageWidth, imageHeight, logoWidth, logoHeight, position, margin) {
  const safeMarginX = (imageWidth * margin) / 100;
  const safeMarginY = (imageHeight * margin) / 100;
  let x, y;

  switch (position) {
    case 'top-left':
      x = safeMarginX;
      y = safeMarginY;
      break;
    case 'top-center':
      x = (imageWidth - logoWidth) / 2;
      y = safeMarginY;
      break;
    case 'top-right':
      x = imageWidth - logoWidth - safeMarginX;
      y = safeMarginY;
      break;
    case 'center-left':
      x = safeMarginX;
      y = (imageHeight - logoHeight) / 2;
      break;
    case 'center':
      x = (imageWidth - logoWidth) / 2;
      y = (imageHeight - logoHeight) / 2;
      break;
    case 'center-right':
      x = imageWidth - logoWidth - safeMarginX;
      y = (imageHeight - logoHeight) / 2;
      break;
    case 'bottom-left':
      x = safeMarginX;
      y = imageHeight - logoHeight - safeMarginY;
      break;
    case 'bottom-center':
      x = (imageWidth - logoWidth) / 2;
      y = imageHeight - logoHeight - safeMarginY;
      break;
    case 'bottom-right':
    default:
      x = imageWidth - logoWidth - safeMarginX;
      y = imageHeight - logoHeight - safeMarginY;
      break;
  }

  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y))
  };
}

function generateNewFileName(index, originalName, settings, imageInfo) {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);

  let newName = baseName;
  if (settings.renameEnabled) {
    const parts = [];
    if (settings.customerName) parts.push(settings.customerName.trim());
    if (settings.shootTheme) parts.push(settings.shootTheme.trim());
    if (settings.keepOriginalName) parts.push(baseName);
    if (settings.addSequence) {
      const seqNum = String(index + 1).padStart(settings.sequenceDigits || 3, '0');
      parts.push(seqNum);
    }
    if (parts.length > 0) {
      newName = parts.join('_');
    }
  }

  if (settings.outputFormat === 'same') {
    return newName + ext;
  } else if (settings.outputFormat === 'jpg') {
    return newName + '.jpg';
  } else if (settings.outputFormat === 'png') {
    return newName + '.png';
  } else if (settings.outputFormat === 'webp') {
    return newName + '.webp';
  }
  return newName + ext;
}

async function processSingleImage(filePath, outputDir, index, total, settings, previewMode = false, customOutputName = null) {
  const imageInfo = await getImageInfo(filePath);
  if (!imageInfo) {
    throw new Error('无法读取图片信息');
  }

  const orientation = imageInfo.orientation;
  const orientSettings = settings.orientationSettings[orientation] || settings.orientationSettings.landscape;

  let pipeline = sharp(filePath);

  if (settings.removeExif) {
    pipeline = pipeline.withMetadata(false);
  } else {
    pipeline = pipeline.withMetadata();
  }

  if (settings.resizeEnabled) {
    if (settings.resizeMode === 'width') {
      pipeline = pipeline.resize(parseInt(settings.resizeWidth) || imageInfo.width, null, {
        withoutEnlargement: !settings.allowEnlargement
      });
    } else if (settings.resizeMode === 'height') {
      pipeline = pipeline.resize(null, parseInt(settings.resizeHeight) || imageInfo.height, {
        withoutEnlargement: !settings.allowEnlargement
      });
    } else if (settings.resizeMode === 'long') {
      const longEdge = parseInt(settings.longEdge) || Math.max(imageInfo.width, imageInfo.height);
      if (imageInfo.width >= imageInfo.height) {
        pipeline = pipeline.resize(longEdge, null, {
          withoutEnlargement: !settings.allowEnlargement
        });
      } else {
        pipeline = pipeline.resize(null, longEdge, {
          withoutEnlargement: !settings.allowEnlargement
        });
      }
    }
  }

  const pipelineMeta = await pipeline.metadata();
  const finalWidth = pipelineMeta.width;
  const finalHeight = pipelineMeta.height;

  let overlays = [];

  if (settings.logoPath && fs.existsSync(settings.logoPath) && orientSettings.logoSize > 0) {
    const logoSizePercent = orientSettings.logoSize;
    let logoTargetWidth;
    if (orientation === 'portrait') {
      logoTargetWidth = Math.round(finalHeight * logoSizePercent / 100);
    } else {
      logoTargetWidth = Math.round(finalWidth * logoSizePercent / 100);
    }

    const logoBuffer = await sharp(settings.logoPath)
      .resize(logoTargetWidth, null, {
        withoutEnlargement: false
      })
      .ensureAlpha()
      .toBuffer();

    const logoMeta = await sharp(logoBuffer).metadata();
    const logoWidth = logoMeta.width;
    const logoHeight = logoMeta.height;

    const pos = calculateWatermarkPosition(
      finalWidth,
      finalHeight,
      logoWidth,
      logoHeight,
      orientSettings.position,
      orientSettings.margin
    );

    if (orientSettings.opacity < 100) {
      const alpha = orientSettings.opacity / 100;
      const alphaSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${logoWidth}" height="${logoHeight}">
        <rect width="100%" height="100%" fill="white" fill-opacity="${alpha}"/>
      </svg>`;
      const semiLogoBuffer = await sharp(logoBuffer)
        .composite([{
          input: Buffer.from(alphaSvg),
          blend: 'dest-in'
        }])
        .toBuffer();
      overlays.push({
        input: semiLogoBuffer,
        left: pos.x,
        top: pos.y
      });
    } else {
      overlays.push({
        input: logoBuffer,
        left: pos.x,
        top: pos.y
      });
    }
  }

  if (settings.textWatermark && settings.textWatermark.trim() && orientSettings.textSize > 0) {
    const fontSize = Math.round(Math.min(finalWidth, finalHeight) * orientSettings.textSize / 100);
    const textColor = settings.textColor || '#FFFFFF';
    const strokeColor = settings.textStrokeColor || '#000000';
    const strokeWidth = settings.textStrokeWidth || 0;
    const fontFamily = settings.textFont || 'sans-serif';

    const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${finalWidth}" height="${finalHeight}">
      <style>
        .wm-text {
          font-family: ${fontFamily};
          font-size: ${fontSize}px;
          fill: ${textColor};
          font-weight: bold;
          ${strokeWidth > 0 ? `stroke: ${strokeColor}; stroke-width: ${strokeWidth}px; paint-order: stroke;` : ''}
          opacity: ${orientSettings.textOpacity / 100};
        }
      </style>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="wm-text">${settings.textWatermark}</text>
    </svg>`;

    const textBuffer = Buffer.from(textSvg);
    const textMeta = await sharp(textBuffer).metadata();
    const textBounds = { width: textMeta.width, height: textMeta.height };

    const textPos = calculateWatermarkPosition(
      finalWidth,
      finalHeight,
      textBounds.width,
      textBounds.height,
      orientSettings.textPosition || orientSettings.position,
      orientSettings.textMargin || orientSettings.margin
    );

    overlays.push({
      input: textBuffer,
      left: textPos.x,
      top: textPos.y
    });
  }

  if (overlays.length > 0) {
    pipeline = pipeline.composite(overlays);
  }

  let outputFormat = settings.outputFormat;
  if (outputFormat === 'same') {
    outputFormat = imageInfo.format === 'jpeg' ? 'jpg' : imageInfo.format;
  }

  let outputBuffer;
  const quality = parseInt(settings.quality) || 85;

  if (outputFormat === 'jpg' || outputFormat === 'jpeg') {
    outputBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    if (settings.removeExif) {
      outputBuffer = Buffer.from(removeExif(outputBuffer, 'jpeg'), 'binary');
    }
  } else if (outputFormat === 'png') {
    const pngQuality = parseInt(settings.pngQuality) || 8;
    outputBuffer = await pipeline.png({ compressionLevel: Math.min(9, Math.max(0, 9 - pngQuality)), palette: true }).toBuffer();
  } else if (outputFormat === 'webp') {
    outputBuffer = await pipeline.webp({ quality }).toBuffer();
  } else {
    outputBuffer = await pipeline.toBuffer();
  }

  if (previewMode) {
    return 'data:image/jpeg;base64,' + outputBuffer.toString('base64');
  }

  const newFileName = customOutputName || generateNewFileName(index, path.basename(filePath), settings, imageInfo);
  const outputPath = path.join(outputDir, newFileName);

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, outputBuffer);

  const outStats = fs.statSync(outputPath);

  return {
    originalPath: filePath,
    outputPath: outputPath,
    outputFileName: newFileName,
    originalSize: imageInfo.size,
    outputSize: outStats.size,
    compressionRatio: imageInfo.size > 0 ? ((1 - outStats.size / imageInfo.size) * 100).toFixed(1) : '0',
    width: finalWidth,
    height: finalHeight,
    orientation: orientation
  };
}

async function previewWatermark(imagePath, settings) {
  return processSingleImage(imagePath, null, 0, 1, settings, true);
}

function initLog(outputDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  logFile = path.join(outputDir, `处理日志_${timestamp}.txt`);
  logStream = fs.createWriteStream(logFile, { encoding: 'utf8' });

  logStream.write('========================================\n');
  logStream.write('照片水印批处理日志\n');
  logStream.write(`生成时间: ${new Date().toLocaleString('zh-CN')}\n`);
  logStream.write('========================================\n\n');
}

function writeLog(message, isError = false) {
  if (!logStream) return;
  const time = new Date().toLocaleTimeString('zh-CN');
  const prefix = isError ? '[错误]' : '[信息]';
  logStream.write(`${time} ${prefix} ${message}\n`);
}

function closeLog() {
  if (logStream) {
    logStream.write('\n========================================\n');
    logStream.write(`日志结束时间: ${new Date().toLocaleString('zh-CN')}\n`);
    logStream.write('========================================\n');
    logStream.end();
    logStream = null;
    const pathToReturn = logFile;
    logFile = null;
    return pathToReturn;
  }
  return null;
}

async function startBatchProcess(files, settings, outputDir, progressCallback) {
  isCancelRequested = false;
  const startTime = Date.now();
  const conflictStrategy = settings.conflictStrategy || 'ask';
  const results = {
    total: files.length,
    success: [],
    failed: [],
    skipped: [],
    logFile: null,
    conflictStrategy: conflictStrategy
  };

  let actualOutputDir = outputDir;
  if (conflictStrategy === 'dateFolder') {
    actualOutputDir = getDateSubfolder(outputDir);
  }

  if (!fs.existsSync(actualOutputDir)) {
    fs.mkdirSync(actualOutputDir, { recursive: true });
  }

  initLog(actualOutputDir);
  writeLog(`开始批处理, 共 ${files.length} 张图片`);
  writeLog(`输出目录: ${actualOutputDir}`);
  writeLog(`冲突策略: ${conflictStrategy}`);
  if (settings.customerName) writeLog(`客户名称: ${settings.customerName}`);
  if (settings.shootTheme) writeLog(`拍摄主题: ${settings.shootTheme}`);

  let perFileTimes = [];
  const usedNames = new Set();

  function getUniqueName(baseName, ext, targetDir) {
    let name = baseName + ext;
    let counter = 1;
    const key = (targetDir + '/' + name).toLowerCase();
    if (!usedNames.has(key) && !fs.existsSync(path.join(targetDir, name))) {
      usedNames.add(key);
      return name;
    }
    while (true) {
      name = `${baseName}_${String(counter).padStart(2, '0')}${ext}`;
      const fullKey = (targetDir + '/' + name).toLowerCase();
      if (!usedNames.has(fullKey) && !fs.existsSync(path.join(targetDir, name))) {
        usedNames.add(fullKey);
        return name;
      }
      counter++;
    }
  }

  for (let i = 0; i < files.length; i++) {
    if (isCancelRequested) {
      writeLog(`处理已被用户取消, 已完成 ${results.success.length + results.failed.length}/${files.length}`);
      break;
    }

    const file = files[i];
    const fileStartTime = Date.now();

    const progress = {
      current: i + 1,
      total: files.length,
      currentFile: file.name || path.basename(file.path),
      currentPath: file.path,
      successCount: results.success.length,
      failedCount: results.failed.length,
      skippedCount: results.skipped.length,
      percent: ((i) / files.length * 100).toFixed(1),
      status: 'processing'
    };

    if (perFileTimes.length > 0) {
      const avgTime = perFileTimes.reduce((a, b) => a + b, 0) / perFileTimes.length;
      const remainingFiles = files.length - i;
      const remainingSeconds = Math.round(avgTime * remainingFiles / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      progress.estimatedTimeRemaining = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
    }

    progressCallback(progress);

    try {
      const imageInfo = await getImageInfo(file.path);
      const ext = imageInfo ? '.' + (imageInfo.format === 'jpeg' ? 'jpg' : imageInfo.format) : path.extname(file.path);
      const baseName = generateNewFileName(i, path.basename(file.path), settings, imageInfo || { format: 'jpg' });
      const baseNameWithoutExt = baseName.replace(path.extname(baseName), '');
      const actualExt = settings.outputFormat === 'same' ? ext : ('.' + settings.outputFormat);

      let outputName = null;
      let skipFile = false;

      if (conflictStrategy === 'skip') {
        const targetPath = path.join(actualOutputDir, baseNameWithoutExt + actualExt);
        if (fs.existsSync(targetPath)) {
          skipFile = true;
          results.skipped.push({
            name: file.name,
            path: file.path,
            reason: '同名文件已存在，跳过'
          });
          writeLog(`⏭ 跳过: ${path.basename(file.path)} - 同名文件已存在`);
        }
      }

      if (skipFile) {
        const fileEndTime = Date.now();
        perFileTimes.push(fileEndTime - fileStartTime);
        if (perFileTimes.length > 20) perFileTimes.shift();
        continue;
      }

      if (conflictStrategy === 'rename') {
        outputName = getUniqueName(baseNameWithoutExt, actualExt, actualOutputDir);
      }

      const result = await processSingleImage(
        file.path,
        actualOutputDir,
        results.success.length,
        files.length,
        settings,
        false,
        outputName
      );
      results.success.push(result);
      writeLog(`✓ 成功: ${path.basename(file.path)} -> ${result.outputFileName} (${(result.outputSize / 1024).toFixed(1)}KB, 压缩${result.compressionRatio}%)`);
    } catch (err) {
      results.failed.push({ path: file.path, name: file.name || path.basename(file.path), error: err.message });
      writeLog(`✗ 失败: ${path.basename(file.path)} - ${err.message}`, true);
    }

    const fileEndTime = Date.now();
    perFileTimes.push(fileEndTime - fileStartTime);
    if (perFileTimes.length > 20) perFileTimes.shift();
  }

  const totalSeconds = Math.round((Date.now() - startTime) / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalSecs = totalSeconds % 60;

  writeLog(`\n--- 处理结果统计 ---`);
  writeLog(`总数: ${files.length}`);
  writeLog(`成功: ${results.success.length}`);
  writeLog(`跳过: ${results.skipped.length}`);
  writeLog(`失败: ${results.failed.length}`);
  writeLog(`总用时: ${totalMinutes > 0 ? totalMinutes + '分' : ''}${totalSecs}秒`);

  if (results.failed.length > 0) {
    writeLog(`\n--- 失败列表 ---`);
    for (const f of results.failed) {
      writeLog(`  - ${f.name}: ${f.error}`, true);
    }
  }

  if (results.skipped.length > 0) {
    writeLog(`\n--- 跳过列表 ---`);
    for (const f of results.skipped) {
      writeLog(`  - ${f.name}: ${f.reason}`);
    }
  }

  results.logFile = closeLog();
  results.totalTime = `${totalMinutes > 0 ? totalMinutes + '分' : ''}${totalSecs}秒`;
  results.totalSeconds = totalSeconds;
  results.outputDir = actualOutputDir;

  progressCallback({
    current: files.length,
    total: files.length,
    successCount: results.success.length,
    failedCount: results.failed.length,
    skippedCount: results.skipped.length,
    percent: '100',
    status: isCancelRequested ? 'cancelled' : 'completed',
    results: results
  });

  return results;
}

function cancelBatch() {
  isCancelRequested = true;
  return true;
}

function isFileReadOnly(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return (stats.mode & 0o200) === 0;
  } catch (err) {
    return false;
  }
}

function checkOutputConflicts(files, outputDir, settings) {
  const conflicts = [];
  const existingNames = new Set();

  if (!fs.existsSync(outputDir)) {
    return { hasConflicts: false, conflicts: [], readOnlyCount: 0, totalConflicts: 0 };
  }

  try {
    const dirEntries = fs.readdirSync(outputDir, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (entry.isFile()) {
        existingNames.add(entry.name.toLowerCase());
      }
    }
  } catch (err) {
    console.error('读取输出目录失败:', err);
  }

  let readOnlyCount = 0;
  let historicalBatches = [];

  try {
    const dirFiles = fs.readdirSync(outputDir);
    for (const name of dirFiles) {
      const fullPath = path.join(outputDir, name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && isFileReadOnly(fullPath)) {
          readOnlyCount++;
        }
      } catch (e) {
        continue;
      }
    }

    const logFiles = dirFiles.filter(f => f.startsWith('处理日志_') && f.endsWith('.txt'));
    historicalBatches = logFiles.map(f => {
      const match = f.match(/处理日志_(.+)\.txt/);
      return match ? match[1] : f;
    }).sort().reverse();
  } catch (err) {
    console.error('检查历史批次失败:', err);
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const imageInfo = { format: path.extname(file.path).toLowerCase().slice(1) };
    const newFileName = generateNewFileName(i, file.name, settings, imageInfo);
    const outputPath = path.join(outputDir, newFileName);

    if (existingNames.has(newFileName.toLowerCase())) {
      const isReadOnly = isFileReadOnly(outputPath);
      let fileSize = null;
      let fileMtime = null;
      try {
        const stat = fs.statSync(outputPath);
        fileSize = stat.size;
        fileMtime = stat.mtime;
      } catch (e) {}

      conflicts.push({
        originalName: file.name,
        originalPath: file.path,
        outputFileName: newFileName,
        outputPath: outputPath,
        isReadOnly: isReadOnly,
        existingSize: fileSize,
        existingMtime: fileMtime
      });
    }
  }

  const hasHistory = historicalBatches.length > 0;
  const hasReadOnly = readOnlyCount > 0;
  const hasNameConflicts = conflicts.length > 0;

  return {
    hasConflicts: hasNameConflicts || hasHistory || hasReadOnly,
    hasNameConflicts: hasNameConflicts,
    hasHistory: hasHistory,
    hasReadOnly: hasReadOnly,
    conflicts: conflicts,
    readOnlyCount: readOnlyCount,
    historicalBatches: historicalBatches,
    totalConflicts: conflicts.length + historicalBatches.length
  };
}

async function previewWatermarkMulti(imagePath, settings, positions) {
  const results = [];

  const imgInfo = await getImageInfo(imagePath);
  const actualOrientation = imgInfo ? imgInfo.orientation : 'landscape';

  for (const pos of positions) {
    const modSettings = JSON.parse(JSON.stringify(settings));
    const positionName = pos.position || pos;

    if (modSettings.orientationSettings && modSettings.orientationSettings[actualOrientation]) {
      modSettings.orientationSettings[actualOrientation].position = positionName;
      modSettings.orientationSettings[actualOrientation].textPosition = pos.textPosition || positionName;
    }

    try {
      const preview = await processSingleImage(imagePath, null, 0, 1, modSettings, true);
      results.push({
        position: positionName,
        orientation: actualOrientation,
        preview: preview,
        label: pos.label || positionName
      });
    } catch (err) {
        results.push({
          position: positionName,
          orientation: actualOrientation,
          preview: null,
          error: err.message,
          label: pos.label || positionName
        });
      }
  }
  return results;
}

function getAutoNumberedName(outputDir, baseName, ext) {
  let counter = 1;
  let newName = `${baseName}_${String(counter).padStart(2, '0')}${ext}`;
  while (fs.existsSync(path.join(outputDir, newName))) {
    counter++;
    newName = `${baseName}_${String(counter).padStart(2, '0')}${ext}`;
  }
  return newName;
}

function getDateSubfolder(baseDir) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const dir = path.join(baseDir, dateStr);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

module.exports = {
  scanImages,
  getThumbnail,
  getImageInfo,
  readExif,
  previewWatermark,
  previewWatermarkMulti,
  startBatchProcess,
  cancelBatch,
  checkOutputConflicts
};
