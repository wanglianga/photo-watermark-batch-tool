const state = {
  files: [],
  selectedFileIndex: null,
  currentOrientationTab: 'landscape',
  orientationSettings: {
    landscape: {
      position: 'bottom-right',
      margin: 3,
      logoSize: 10,
      opacity: 100,
      textPosition: 'bottom-center',
      textMargin: 5,
      textSize: 3,
      textOpacity: 80
    },
    portrait: {
      position: 'bottom-right',
      margin: 3,
      logoSize: 10,
      opacity: 100,
      textPosition: 'bottom-center',
      textMargin: 5,
      textSize: 3,
      textOpacity: 80
    },
    square: {
      position: 'bottom-right',
      margin: 3,
      logoSize: 10,
      opacity: 100,
      textPosition: 'bottom-center',
      textMargin: 5,
      textSize: 3,
      textOpacity: 80
    }
  },
  outputDir: null,
  isProcessing: false,
  templates: [],
  currentFolderName: null,
  multiPreviewSampleIndex: 0,
  multiPreviewResults: [],
  conflictStrategy: 'skip',
  lastConflictCheck: null
};

const $ = (id) => document.getElementById(id);

function showToast(message, type = 'info', duration = 3000) {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), duration);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function updateFileStats() {
  $('file-count').textContent = state.files.length;
  const stats = $('file-stats');
  if (state.files.length > 0) {
    stats.classList.remove('hidden');
  } else {
    stats.classList.add('hidden');
  }
  updateActionButtons();
}

function updateActionButtons() {
  const hasFiles = state.files.length > 0;
  const hasOutput = !!state.outputDir;
  const canProcess = hasFiles && hasOutput && !state.isProcessing;
  $('btn-preview').disabled = !hasFiles || state.isProcessing;
  $('btn-multi-preview').disabled = !hasFiles || state.isProcessing;
  $('btn-start').disabled = !canProcess;
  $('btn-cancel').disabled = !state.isProcessing;
}

async function addFiles(newFiles) {
  const existingPaths = new Set(state.files.map(f => f.path));
  const toAdd = [];

  for (const f of newFiles) {
    if (!existingPaths.has(f.path)) {
      toAdd.push(f);
    }
  }

  if (toAdd.length === 0 && newFiles.length > 0) {
    showToast('所有文件已在列表中', 'info');
    return;
  }

  for (const f of toAdd) {
    state.files.push(f);
  }

  await renderFileList(toAdd);
  updateFileStats();

  if (toAdd.length > 0) {
    showToast(`已添加 ${toAdd.length} 张图片`, 'success');
  }
}

async function renderFileList(newFiles = null) {
  const list = $('file-list');
  const filesToProcess = newFiles || state.files;

  if (state.files.length === 0) {
    list.innerHTML = '<p class="empty-hint">暂无图片，拖入文件夹开始</p>';
    return;
  }

  if (!newFiles) {
    list.innerHTML = '';
  }

  for (let i = newFiles ? state.files.length - newFiles.length : 0; i < state.files.length; i++) {
    const file = state.files[i];
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.index = i;

    let info = file.info;
    let orientation = 'landscape';
    if (info) {
      orientation = info.orientation;
    }

    item.classList.add(orientation);

    let thumbHtml = '<div class="file-thumb">...</div>';
    if (file.thumbnail) {
      thumbHtml = `<img class="file-thumb" src="${file.thumbnail}" alt="">`;
    }

    const metaText = info
      ? `${info.width}×${info.height} · ${formatSize(file.size)}`
      : formatSize(file.size);

    item.innerHTML = `
      ${thumbHtml}
      <div class="file-info">
        <div class="file-name" title="${file.name}">${file.name}</div>
        <div class="file-meta">${metaText}</div>
      </div>
      <button class="file-remove" title="移除">×</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('file-remove')) return;
      selectFile(i);
    });

    item.querySelector('.file-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(i);
    });

    list.appendChild(item);
  }

  for (let i = newFiles ? state.files.length - newFiles.length : 0; i < state.files.length; i++) {
    const idx = i;
    if (!state.files[idx].thumbnail) {
      window.api.getThumbnail(state.files[idx].path, 96).then(thumb => {
        if (thumb && state.files[idx]) {
          state.files[idx].thumbnail = thumb;
          const itemEl = list.querySelector(`[data-index="${idx}"]`);
          if (itemEl) {
            const img = itemEl.querySelector('.file-thumb');
            if (img && img.tagName === 'IMG') {
              img.src = thumb;
            }
          }
        }
      });
    }
    if (!state.files[idx].info) {
      window.api.getImageInfo(state.files[idx].path).then(info => {
        if (info && state.files[idx]) {
          state.files[idx].info = info;
          const itemEl = list.querySelector(`[data-index="${idx}"]`);
          if (itemEl) {
            const meta = itemEl.querySelector('.file-meta');
            if (meta) {
              meta.textContent = `${info.width}×${info.height} · ${formatSize(state.files[idx].size)}`;
            }
            itemEl.classList.remove('landscape', 'portrait', 'square');
            itemEl.classList.add(info.orientation);
          }
        }
      });
    }
  }
}

function removeFile(index) {
  state.files.splice(index, 1);
  if (state.selectedFileIndex === index) {
    state.selectedFileIndex = null;
    clearPreview();
    clearExif();
  } else if (state.selectedFileIndex > index) {
    state.selectedFileIndex--;
  }
  renderFileList();
  updateFileStats();
}

function clearFiles() {
  state.files = [];
  state.selectedFileIndex = null;
  clearPreview();
  clearExif();
  renderFileList();
  updateFileStats();
  showToast('已清空文件列表', 'info');
}

async function selectFile(index) {
  state.selectedFileIndex = index;
  document.querySelectorAll('.file-item').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });

  const file = state.files[index];
  showPreview(file);
  showExif(file.path);
}

async function showPreview(file) {
  const container = $('preview-container');
  const info = file.info || await window.api.getImageInfo(file.path);
  if (!file.thumbnail) {
    file.thumbnail = await window.api.getThumbnail(file.path, 400);
  }

  let html = '';
  if (file.thumbnail) {
    html = `<img src="${file.thumbnail}" alt="${file.name}">`;
  } else {
    html = '<p class="empty-hint">无法预览该图片</p>';
  }

  if (info) {
    const sizeText = file.size;
    html += `
      <div class="preview-details">
        <div><span>文件名</span><span>${file.name}</span></div>
        <div><span>尺寸</span><span>${info.width} × ${info.height} px</span></div>
        <div><span>方向</span><span>${info.orientation === 'landscape' ? '横图' : info.orientation === 'portrait' ? '竖图' : '方图'}</span></div>
        <div><span>大小</span><span>${formatSize(sizeText)}</span></div>
        <div><span>格式</span><span>${(info.format || '未知').toUpperCase()}</span></div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function clearPreview() {
  $('preview-container').innerHTML = '<p class="empty-hint">选择文件后查看预览</p>';
}

async function showExif(imagePath) {
  const panel = $('exif-panel');
  panel.innerHTML = '<p class="empty-hint">正在读取 EXIF...</p>';

  const exif = await window.api.readExif(imagePath);
  if (!exif.hasExif || Object.keys(exif.data).length === 0) {
    panel.innerHTML = '<p class="empty-hint">未检测到 EXIF 信息</p>';
    return;
  }

  const d = exif.data;
  let html = '';

  const labels = {
    camera: '相机型号',
    lens: '镜头',
    aperture: '光圈',
    shutter: '快门',
    iso: '感光度',
    focalLength: '焦距',
    dateTime: '拍摄时间',
    artist: '作者',
    copyright: '版权',
    description: '描述',
    gps: 'GPS坐标'
  };

  for (const key of Object.keys(labels)) {
    if (d[key]) {
      html += `<div class="exif-row"><span class="exif-label">${labels[key]}</span><span class="exif-value">${d[key]}</span></div>`;
    }
  }

  if (d.raw && Object.keys(d.raw).length > 0) {
    const rawCount = Object.keys(d.raw).length;
    html += `
      <div class="exif-raw-toggle">
        <button class="btn btn-outline btn-small" id="btn-toggle-exif-raw" style="width:100%">显示全部 EXIF (${rawCount}项)</button>
      </div>
      <div class="exif-raw hidden" id="exif-raw-content">
    `;
    for (const [k, v] of Object.entries(d.raw)) {
      if (['camera', 'lens', 'aperture', 'shutter', 'iso', 'focalLength', 'dateTime', 'artist', 'copyright', 'description', 'gps'].includes(k)) continue;
      html += `<div style="padding:2px 0"><strong>${k}:</strong> ${v}</div>`;
    }
    html += `</div>`;
  }

  panel.innerHTML = html;

  const toggleBtn = $('btn-toggle-exif-raw');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const rawContent = $('exif-raw-content');
      rawContent.classList.toggle('hidden');
      toggleBtn.textContent = rawContent.classList.contains('hidden') ? `显示全部 EXIF (${rawCount}项)` : `隐藏全部 EXIF`;
    });
  }
}

function clearExif() {
  $('exif-panel').innerHTML = '<p class="empty-hint">选择文件后查看EXIF</p>';
}

function collectSettings() {
  return {
    logoPath: $('logo-path').value.trim() || null,
    textWatermark: $('text-watermark').value.trim(),
    textColor: $('text-color').value,
    textStrokeColor: $('text-stroke-color').value,
    textStrokeWidth: parseFloat($('text-stroke-width').value) || 0,
    textFont: $('text-font').value,

    renameEnabled: $('rename-enabled').checked,
    customerName: $('customer-name').value.trim(),
    shootTheme: $('shoot-theme').value.trim(),
    keepOriginalName: $('keep-original-name').checked,
    addSequence: $('add-sequence').checked,
    sequenceDigits: parseInt($('sequence-digits').value) || 3,

    outputFormat: $('output-format').value,
    quality: parseInt($('quality').value) || 85,
    removeExif: $('remove-exif').checked,

    resizeEnabled: $('resize-enabled').checked,
    resizeMode: $('resize-mode').value,
    resizeWidth: parseInt($('resize-long-edge').value) || 2000,
    resizeHeight: parseInt($('resize-long-edge').value) || 2000,
    longEdge: parseInt($('resize-long-edge').value) || 2000,
    allowEnlargement: $('allow-enlargement').checked,

    orientationSettings: JSON.parse(JSON.stringify(state.orientationSettings)),
    conflictStrategy: state.conflictStrategy
  };
}

async function loadTemplates() {
  try {
    state.templates = await window.api.getTemplates() || [];
    renderTemplateSelect();
  } catch (err) {
    console.error('加载模板失败:', err);
  }
}

function renderTemplateSelect() {
  const select = $('template-select');
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- 选择模板 --</option>';

  for (const tpl of state.templates) {
    const opt = document.createElement('option');
    opt.value = tpl.id;
    opt.textContent = tpl.name || tpl.id;
    select.appendChild(opt);
  }

  if (currentVal && state.templates.find(t => t.id === currentVal)) {
    select.value = currentVal;
  }
}

async function handleSaveTemplate() {
  const name = $('template-name').value.trim();
  if (!name) {
    showToast('请输入模板名称', 'error');
    return;
  }

  const settings = collectSettings();
  const template = {
    name: name,
    settings: settings,
    customerName: settings.customerName
  };

  const existing = state.templates.find(t => t.name === name);
  if (existing) {
    if (!confirm(`模板「${name}」已存在，是否覆盖？`)) {
      return;
    }
    template.id = existing.id;
  }

  try {
    const saved = await window.api.saveTemplate(template);
    await loadTemplates();
    $('template-select').value = saved.id;
    showToast('模板保存成功', 'success');
  } catch (err) {
    console.error(err);
    showToast('保存模板失败: ' + err.message, 'error');
  }
}

async function handleDeleteTemplate() {
  const tplId = $('template-select').value;
  if (!tplId) {
    showToast('请先选择要删除的模板', 'error');
    return;
  }

  const tpl = state.templates.find(t => t.id === tplId);
  if (!tpl) return;

  if (!confirm(`确定要删除模板「${tpl.name}」吗？`)) {
    return;
  }

  try {
    await window.api.deleteTemplate(tplId);
    await loadTemplates();
    $('template-name').value = '';
    showToast('模板已删除', 'success');
  } catch (err) {
    console.error(err);
    showToast('删除模板失败: ' + err.message, 'error');
  }
}

function applyTemplate(template) {
  if (!template || !template.settings) return;

  const s = template.settings;

  if (s.logoPath) $('logo-path').value = s.logoPath;
  if (s.textWatermark !== undefined) $('text-watermark').value = s.textWatermark;
  if (s.textColor) $('text-color').value = s.textColor;
  if (s.textStrokeColor) $('text-stroke-color').value = s.textStrokeColor;
  if (s.textStrokeWidth !== undefined) $('text-stroke-width').value = s.textStrokeWidth;
  if (s.textFont) $('text-font').value = s.textFont;

  if (s.renameEnabled !== undefined) $('rename-enabled').checked = s.renameEnabled;
  if (s.customerName !== undefined) $('customer-name').value = s.customerName;
  if (s.shootTheme !== undefined) $('shoot-theme').value = s.shootTheme;
  if (s.keepOriginalName !== undefined) $('keep-original-name').checked = s.keepOriginalName;
  if (s.addSequence !== undefined) $('add-sequence').checked = s.addSequence;
  if (s.sequenceDigits !== undefined) $('sequence-digits').value = s.sequenceDigits;

  if (s.outputFormat) $('output-format').value = s.outputFormat;
  if (s.quality !== undefined) $('quality').value = s.quality;
  if (s.removeExif !== undefined) $('remove-exif').checked = s.removeExif;

  if (s.resizeEnabled !== undefined) $('resize-enabled').checked = s.resizeEnabled;
  if (s.resizeMode) $('resize-mode').value = s.resizeMode;
  if (s.longEdge !== undefined) $('resize-long-edge').value = s.longEdge;
  if (s.allowEnlargement !== undefined) $('allow-enlargement').checked = s.allowEnlargement;

  if (s.orientationSettings) {
    state.orientationSettings = JSON.parse(JSON.stringify(s.orientationSettings));
    const orientInputs = document.querySelectorAll('.orient-setting');
    orientInputs.forEach(input => {
      const field = input.dataset.field;
      const tabSettings = state.orientationSettings[state.currentOrientationTab];
      if (tabSettings && tabSettings[field] !== undefined) {
        input.value = tabSettings[field];
      }
    });
  }

  if (template.name) {
    $('template-name').value = template.name;
  }

  const resizeOptions = $('resize-options');
  if (resizeOptions) {
    resizeOptions.classList.toggle('hidden', !$('resize-enabled').checked);
  }

  showToast(`已应用模板「${template.name}」`, 'success');
}

function handleTemplateSelect(e) {
  const tplId = e.target.value;
  if (!tplId) return;

  const tpl = state.templates.find(t => t.id === tplId);
  if (tpl) {
    applyTemplate(tpl);
  }
}

function findRecommendedTemplate(folderName, customerName) {
  if (!folderName && !customerName) return null;

  const searchTerms = [];
  if (folderName) searchTerms.push(folderName.toLowerCase());
  if (customerName) searchTerms.push(customerName.toLowerCase());

  let bestMatch = null;
  let bestScore = 0;

  for (const tpl of state.templates) {
    let score = 0;
    const tplName = (tpl.name || '').toLowerCase();
    const tplCustomer = (tpl.customerName || '').toLowerCase();

    for (const term of searchTerms) {
      if (!term) continue;
      if (tplName === term) score += 100;
      else if (tplName.includes(term)) score += 50;
      if (tplCustomer === term) score += 80;
      else if (tplCustomer.includes(term)) score += 40;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = tpl;
    }
  }

  return bestScore >= 40 ? bestMatch : null;
}

function showTemplateRecommendation(template) {
  if (!template) {
    $('template-recommend-banner').classList.add('hidden');
    return;
  }
  $('recommend-template-name').textContent = template.name;
  $('template-recommend-banner').classList.remove('hidden');
  state.recommendedTemplate = template;
}

function hideTemplateRecommendation() {
  $('template-recommend-banner').classList.add('hidden');
  state.recommendedTemplate = null;
}

async function checkAndRecommendTemplate(folderPath) {
  if (!folderPath || state.templates.length === 0) return;

  try {
    const folderName = await window.api.getFolderCustomerName(folderPath);
    state.currentFolderName = folderName;

    const customerName = $('customer-name').value.trim();
    const recommended = findRecommendedTemplate(folderName, customerName);

    if (recommended) {
      showTemplateRecommendation(recommended);
    } else {
      hideTemplateRecommendation();
    }
  } catch (err) {
    console.error('模板推荐检查失败:', err);
  }
}

const SAMPLE_POSITIONS = [
  { position: 'top-left', textPosition: 'top-left', label: '左上' },
  { position: 'top-right', textPosition: 'top-right', label: '右上' },
  { position: 'bottom-left', textPosition: 'bottom-left', label: '左下' },
  { position: 'bottom-right', textPosition: 'bottom-right', label: '右下' },
  { position: 'top-center', textPosition: 'top-center', label: '上中' },
  { position: 'bottom-center', textPosition: 'bottom-center', label: '下中' }
];

async function handleMultiPreview() {
  if (state.files.length === 0) {
    showToast('请先导入图片', 'error');
    return;
  }

  const settings = collectSettings();
  if (!settings.logoPath && !settings.textWatermark) {
    showToast('请至少设置 Logo 或文字水印', 'error');
    return;
  }

  state.multiPreviewSampleIndex = state.selectedFileIndex !== null ? state.selectedFileIndex : 0;
  const sampleFile = state.files[state.multiPreviewSampleIndex];

  $('multi-preview-modal').classList.remove('hidden');
  $('multi-preview-grid').innerHTML = '<p class="empty-hint">正在生成多构图预览...</p>';
  updateMultiPreviewInfo();

  try {
    const results = await window.api.previewWatermarkMulti(sampleFile.path, settings, SAMPLE_POSITIONS);
    state.multiPreviewResults = results;
    renderMultiPreviewGrid();
  } catch (err) {
    console.error(err);
    $('multi-preview-grid').innerHTML = '<p class="empty-hint" style="color:var(--danger-color)">预览生成失败: ' + err.message + '</p>';
  }
}

function updateMultiPreviewInfo() {
  const total = state.files.length;
  const current = state.multiPreviewSampleIndex + 1;
  const file = state.files[state.multiPreviewSampleIndex];
  $('multi-preview-sample-info').textContent = `第 ${current} / ${total} 张 · ${file ? file.name : ''}`;
}

function renderMultiPreviewGrid() {
  const grid = $('multi-preview-grid');
  if (!state.multiPreviewResults || state.multiPreviewResults.length === 0) {
    grid.innerHTML = '<p class="empty-hint">暂无预览结果</p>';
    return;
  }

  const currentSettings = state.orientationSettings[state.currentOrientationTab];
  const currentPosition = currentSettings ? currentSettings.position : 'bottom-right';

  let html = '';
  for (const result of state.multiPreviewResults) {
    const isSelected = result.position === currentPosition;
    html += `
      <div class="preview-card ${isSelected ? 'selected' : ''}" data-position="${result.position}">
        ${result.preview ? `<img src="${result.preview}" alt="${result.label}">` : '<div class="empty-hint">生成失败</div>'}
        <div class="preview-card-label">${result.label}${isSelected ? ' ✓' : ''}</div>
      </div>
    `;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.preview-card').forEach(card => {
    card.addEventListener('click', () => {
      const position = card.dataset.position;
      applyPositionToCurrentOrientation(position);
      renderMultiPreviewGrid();
    });
  });
}

function applyPositionToCurrentOrientation(position) {
  const tab = state.currentOrientationTab;
  if (state.orientationSettings[tab]) {
    state.orientationSettings[tab].position = position;
    state.orientationSettings[tab].textPosition = position;
    const orientInputs = document.querySelectorAll('.orient-setting');
    orientInputs.forEach(input => {
      const field = input.dataset.field;
      const settings = state.orientationSettings[tab];
      if (settings && settings[field] !== undefined) {
        input.value = settings[field];
      }
    });
  }
}

function handlePrevSample() {
  if (state.multiPreviewSampleIndex > 0) {
    state.multiPreviewSampleIndex--;
    updateMultiPreviewInfo();
    refreshMultiPreview();
  }
}

function handleNextSample() {
  if (state.multiPreviewSampleIndex < state.files.length - 1) {
    state.multiPreviewSampleIndex++;
    updateMultiPreviewInfo();
    refreshMultiPreview();
  }
}

async function refreshMultiPreview() {
  const sampleFile = state.files[state.multiPreviewSampleIndex];
  if (!sampleFile) return;

  $('multi-preview-grid').innerHTML = '<p class="empty-hint">正在生成多构图预览...</p>';
  const settings = collectSettings();

  try {
    const results = await window.api.previewWatermarkMulti(sampleFile.path, settings, SAMPLE_POSITIONS);
    state.multiPreviewResults = results;
    renderMultiPreviewGrid();
  } catch (err) {
    $('multi-preview-grid').innerHTML = '<p class="empty-hint" style="color:var(--danger-color)">预览生成失败</p>';
  }
}

function closeMultiPreviewModal() {
  $('multi-preview-modal').classList.add('hidden');
}

async function checkOutputConflicts() {
  if (!state.outputDir || state.files.length === 0) {
    return null;
  }

  const settings = collectSettings();
  try {
    const result = await window.api.checkOutputConflicts(state.files, state.outputDir, settings);
    state.lastConflictCheck = result;
    return result;
  } catch (err) {
    console.error('冲突检查失败:', err);
    return null;
  }
}

async function showConflictModal() {
  const conflictResult = state.lastConflictCheck;
  if (!conflictResult || !conflictResult.hasConflicts) {
    return false;
  }

  $('conflict-total-count').textContent = conflictResult.totalConflicts;

  const readOnlyWarn = $('conflict-readonly-warning');
  if (conflictResult.readOnlyCount > 0) {
    $('conflict-readonly-count').textContent = conflictResult.readOnlyCount;
    readOnlyWarn.classList.remove('hidden');
  } else {
    readOnlyWarn.classList.add('hidden');
  }

  const historyInfo = $('conflict-history-info');
  if (conflictResult.historicalBatches && conflictResult.historicalBatches.length > 0) {
    $('conflict-history-count').textContent = conflictResult.historicalBatches.length;
    historyInfo.classList.remove('hidden');
  } else {
    historyInfo.classList.add('hidden');
  }

  const listEl = $('conflict-file-list');
  const previewConflicts = conflictResult.conflicts.slice(0, 10);
  let listHtml = '';
  for (const c of previewConflicts) {
    const sizeText = c.existingSize ? formatSize(c.existingSize) : '';
    listHtml += `
      <div class="conflict-file-item ${c.isReadOnly ? 'readonly' : ''}">
        <span class="file-name" title="${c.outputFileName}">${c.outputFileName}</span>
        <span class="file-status">${c.isReadOnly ? '🔒 只读' : sizeText}</span>
      </div>
    `;
  }
  if (conflictResult.conflicts.length > 10) {
    listHtml += `<div class="conflict-file-item"><span class="file-name">... 还有 ${conflictResult.conflicts.length - 10} 个</span><span class="file-status"></span></div>`;
  }
  listEl.innerHTML = listHtml;

  const selected = document.querySelector('input[name="conflict-strategy"]:checked');
  if (selected) {
    state.conflictStrategy = selected.value;
  }

  $('conflict-modal').classList.remove('hidden');

  return new Promise((resolve) => {
    const confirmBtn = $('btn-confirm-conflict');
    const cancelBtn = $('btn-cancel-conflict');
    const closeBtn = $('btn-close-conflict-modal');

    function cleanup() {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      $('conflict-modal').classList.add('hidden');
    }

    function onConfirm() {
      const selected = document.querySelector('input[name="conflict-strategy"]:checked');
      if (selected) {
        state.conflictStrategy = selected.value;
      }
      cleanup();
      resolve(true);
    }

    function onCancel() {
      cleanup();
      resolve(false);
    }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
  });
}

async function handleConflictStrategyAnotherDir() {
  const dir = await window.api.selectOutput();
  if (dir) {
    state.outputDir = dir;
    $('output-dir').value = dir;
    return true;
  }
  return false;
}

async function handlePreview() {
  if (state.files.length === 0) {
    showToast('请先导入图片', 'error');
    return;
  }

  const sampleIndex = state.selectedFileIndex !== null ? state.selectedFileIndex : 0;
  const sampleFile = state.files[sampleIndex];

  const settings = collectSettings();
  if (!settings.logoPath && !settings.textWatermark) {
    showToast('请至少设置 Logo 或文字水印', 'error');
    return;
  }

  showToast('正在生成预览...', 'info');

  try {
    const watermarked = await window.api.previewWatermark(sampleFile.path, settings);
    const original = sampleFile.thumbnail || await window.api.getThumbnail(sampleFile.path, 800);

    $('preview-original').src = original;
    $('preview-watermarked').src = watermarked;
    $('preview-modal').classList.remove('hidden');
  } catch (err) {
    console.error(err);
    showToast('预览生成失败: ' + err.message, 'error');
  }
}

function closeModal() {
  $('preview-modal').classList.add('hidden');
}

async function handleStart() {
  if (state.isProcessing) return;

  const settings = collectSettings();
  if (!state.outputDir) {
    showToast('请先选择输出目录', 'error');
    return;
  }
  if (!settings.logoPath && !settings.textWatermark) {
    if (!confirm('未设置水印内容，将只进行重命名和压缩导出，是否继续？')) return;
  }
  if (state.files.length > 200) {
    if (!confirm(`共 ${state.files.length} 张图片，数量较多，确认开始处理？`)) return;
  }

  let conflictResolved = false;
  let maxAttempts = 10;
  let attempts = 0;

  while (!conflictResolved && attempts < maxAttempts) {
    attempts++;
    showToast('正在检查输出目录...', 'info');
    const conflictResult = await checkOutputConflicts();

    if (!conflictResult || !conflictResult.hasConflicts) {
      conflictResolved = true;
      break;
    }

    const confirmed = await showConflictModal();
    if (!confirmed) {
      return;
    }

    if (state.conflictStrategy === 'anotherDir') {
      const newDir = await window.api.selectOutput();
      if (!newDir) {
        showToast('已取消，请重新选择输出目录', 'info');
        return;
      }
      state.outputDir = newDir;
      $('output-dir').value = newDir;
      $('btn-open-output').disabled = false;
      updateActionButtons();
      continue;
    }

    conflictResolved = true;
  }

  const finalSettings = collectSettings();
  finalSettings.conflictStrategy = state.conflictStrategy;

  state.isProcessing = true;
  $('btn-start').disabled = true;
  $('btn-preview').disabled = true;
  $('btn-multi-preview').disabled = true;
  $('btn-cancel').classList.remove('hidden');
  $('btn-cancel').disabled = false;
  $('result-panel').innerHTML = '<p class="empty-hint">处理中...</p>';

  updateProgress({
    current: 0,
    total: state.files.length,
    currentFile: '准备中...',
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    percent: '0',
    status: 'processing'
  });

  try {
    const result = await window.api.startBatchProcess(state.files, finalSettings, state.outputDir);
    showBatchResult(result);
    if (result.outputDir && result.outputDir !== state.outputDir) {
      state.outputDir = result.outputDir;
      $('output-dir').value = result.outputDir;
    }
  } catch (err) {
    console.error(err);
    showToast('批处理出错: ' + err.message, 'error');
  } finally {
    state.isProcessing = false;
    $('btn-cancel').classList.add('hidden');
    updateActionButtons();
  }
}

async function handleCancel() {
  if (!state.isProcessing) return;
  if (!confirm('确定要取消当前批处理吗？')) return;
  await window.api.cancelBatch();
  showToast('正在取消...', 'info');
}

function updateProgress(p) {
  $('progress-bar').style.width = p.percent + '%';
  $('progress-percent').textContent = p.percent + '%';
  $('stat-current').textContent = p.currentFile || '-';
  $('stat-progress').textContent = `${p.current} / ${p.total}`;
  $('stat-success').textContent = `✓ ${p.successCount || 0}`;
  $('stat-failed').textContent = `✗ ${p.failedCount || 0}`;
  $('stat-eta').textContent = p.estimatedTimeRemaining || '-';
  const skippedEl = $('stat-skipped');
  if (skippedEl) {
    skippedEl.textContent = `⏭ ${p.skippedCount || 0}`;
  }
}

function showBatchResult(result) {
  const panel = $('result-panel');
  let html = '';

  const statusText = result.status === 'cancelled' ? '已取消' : '已完成';
  const statusColor = result.status === 'cancelled' ? 'var(--text-secondary)' : 'var(--success-color)';
  const skippedCount = result.skipped ? result.skipped.length : 0;

  html += `
    <div class="result-summary">
      <div class="summary-row"><span class="summary-label">状态</span><span class="summary-value" style="color:${statusColor}">${statusText}</span></div>
      <div class="summary-row"><span class="summary-label">处理总数</span><span class="summary-value">${result.total}</span></div>
      <div class="summary-row"><span class="summary-label">成功</span><span class="summary-value" style="color:var(--success-color)">${result.success.length}</span></div>
      ${skippedCount > 0 ? `<div class="summary-row"><span class="summary-label">跳过</span><span class="summary-value" style="color:var(--text-secondary)">${skippedCount}</span></div>` : ''}
      <div class="summary-row"><span class="summary-label">失败</span><span class="summary-value" style="color:var(--danger-color)">${result.failed.length}</span></div>
      <div class="summary-row"><span class="summary-label">总用时</span><span class="summary-value">${result.totalTime || '-'}</span></div>
      ${result.outputDir ? `<div class="summary-row"><span class="summary-label">输出目录</span><span class="summary-value" style="font-size:11px">${result.outputDir}</span></div>` : ''}
    </div>
  `;

  if (result.logFile) {
    html += `<button class="btn btn-outline btn-small result-log-btn" id="btn-view-log">📋 查看处理日志</button>`;
  }

  const showFiles = result.success.slice(0, 5).concat(result.failed.slice(0, 3));
  if (showFiles.length > 0) {
    html += '<div class="result-files">';
    for (const f of result.success.slice(0, 5)) {
      html += `
        <div class="result-file success">
          <div class="rf-name" title="${f.outputFileName}">${f.outputFileName}</div>
          <div class="rf-meta">${f.width}×${f.height} · ${formatSize(f.outputSize)} · 压缩${f.compressionRatio}%</div>
        </div>
      `;
    }
    for (const f of result.failed.slice(0, 3)) {
      html += `
        <div class="result-file failed">
          <div class="rf-name" title="${f.name}">${f.name}</div>
          <div class="rf-meta">错误: ${f.error}</div>
        </div>
      `;
    }
    const moreCount = result.success.length - 5 + result.failed.length - 3;
    if (moreCount > 0) {
      html += `<div class="rf-meta" style="padding-left:0;text-align:center;padding-top:8px">... 还有 ${moreCount} 个文件</div>`;
    }
    html += '</div>';
  }

  panel.innerHTML = html;

  const logBtn = $('btn-view-log');
  if (logBtn && result.logFile) {
    logBtn.addEventListener('click', () => {
      window.api.openPath(result.logFile);
    });
  }

  const successCount = result.success.length;
  const failedCount = result.failed.length;

  if (result.status === 'cancelled') {
    window.api.showNotification('批处理已取消', `已完成 ${successCount} 张，失败 ${failedCount} 张`);
    showToast('批处理已取消', 'info');
  } else if (failedCount === 0) {
    window.api.showNotification('批处理完成', `成功处理 ${successCount} 张图片！`);
    showToast(`成功处理 ${successCount} 张图片！`, 'success');
  } else {
    window.api.showNotification('批处理完成', `成功 ${successCount} 张，失败 ${failedCount} 张`);
    showToast(`完成！成功 ${successCount} 张，失败 ${failedCount} 张`, failedCount > successCount ? 'error' : 'info');
  }
}

function initOrientationTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const orientInputs = document.querySelectorAll('.orient-setting');

  function applySettingsToUI(settings) {
    orientInputs.forEach(input => {
      const field = input.dataset.field;
      if (settings[field] !== undefined) {
        input.value = settings[field];
      }
    });
  }

  function readUISettings() {
    const s = {};
    orientInputs.forEach(input => {
      const field = input.dataset.field;
      if (input.type === 'number') {
        s[field] = parseFloat(input.value) || 0;
      } else {
        s[field] = input.value;
      }
    });
    return s;
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      state.orientationSettings[state.currentOrientationTab] = readUISettings();
      state.currentOrientationTab = tab;
      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      applySettingsToUI(state.orientationSettings[tab]);
    });
  });

  applySettingsToUI(state.orientationSettings[state.currentOrientationTab]);

  orientInputs.forEach(input => {
    input.addEventListener('change', () => {
      state.orientationSettings[state.currentOrientationTab] = readUISettings();
    });
  });

  $('btn-copy-to-all').addEventListener('click', () => {
    const current = readUISettings();
    state.orientationSettings.landscape = { ...current };
    state.orientationSettings.portrait = { ...current };
    state.orientationSettings.square = { ...current };
    showToast('已复制到横/竖/方图设置', 'success');
  });
}

function initResizeOptions() {
  const checkbox = $('resize-enabled');
  const options = $('resize-options');
  const mode = $('resize-mode');
  const label = $('resize-value-label');

  function toggle() {
    options.classList.toggle('hidden', !checkbox.checked);
  }

  function updateLabel() {
    switch (mode.value) {
      case 'width': label.textContent = '宽度(px)'; break;
      case 'height': label.textContent = '高度(px)'; break;
      case 'long': default: label.textContent = '长边(px)'; break;
    }
  }

  checkbox.addEventListener('change', toggle);
  mode.addEventListener('change', updateLabel);
  toggle();
  updateLabel();
}

function setupDragAndDrop() {
  const dropZone = $('drop-zone');

  ['dragenter', 'dragover'].forEach(event => {
    dropZone.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(event => {
    dropZone.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    const droppedPaths = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && file.path) {
          droppedPaths.push(file.path);
        }
      }
    }

    if (droppedPaths.length === 0) {
      showToast('未找到文件', 'error');
      return;
    }

    let firstFolder = null;
    for (const p of droppedPaths) {
      const pathType = await window.api.checkPathType(p);
      if (pathType && pathType.isDirectory) {
        firstFolder = p;
        break;
      } else if (pathType && pathType.folder) {
        firstFolder = pathType.folder;
        break;
      }
    }

    const collected = await window.api.parseFilePaths(droppedPaths);

    if (collected.length === 0) {
      showToast('未找到支持的图片文件', 'error');
      return;
    }

    await addFiles(collected);

    if (firstFolder && state.templates.length > 0) {
      checkAndRecommendTemplate(firstFolder);
    } else if (collected.length > 0 && state.templates.length > 0) {
      const firstFileFolder = collected[0].folder;
      if (firstFileFolder) {
        checkAndRecommendTemplate(firstFileFolder);
      }
    }
  });
}

function setupFileSelectors() {
  $('btn-select-folder').addEventListener('click', async () => {
    const folders = await window.api.selectFolder();
    if (folders && folders.length > 0) {
      const files = await window.api.scanImages(folders);
      if (files.length === 0) {
        showToast('所选文件夹中未找到图片', 'info');
      } else {
        await addFiles(files);
        if (state.templates.length > 0) {
          checkAndRecommendTemplate(folders[0]);
        }
      }
    }
  });

  $('btn-select-files').addEventListener('click', async () => {
    const paths = await window.api.selectFiles();
    if (paths && paths.length > 0) {
      const files = await window.api.parseFilePaths(paths);
      await addFiles(files);
      if (files.length > 0 && state.templates.length > 0) {
        checkAndRecommendTemplate(files[0].folder);
      }
    }
  });

  $('btn-select-logo').addEventListener('click', async () => {
    const logoPath = await window.api.selectLogo();
    if (logoPath) {
      $('logo-path').value = logoPath;
    }
  });

  $('btn-select-output').addEventListener('click', async () => {
    const dir = await window.api.selectOutput();
    if (dir) {
      state.outputDir = dir;
      $('output-dir').value = dir;
      $('btn-open-output').disabled = false;
      updateActionButtons();
    }
  });

  $('btn-open-output').addEventListener('click', async () => {
    if (state.outputDir) {
      const ok = await window.api.openOutputFolder(state.outputDir);
      if (!ok) showToast('无法打开目录', 'error');
    }
  });

  $('btn-clear-files').addEventListener('click', clearFiles);

  $('btn-save-template').addEventListener('click', handleSaveTemplate);
  $('btn-delete-template').addEventListener('click', handleDeleteTemplate);
  $('template-select').addEventListener('change', handleTemplateSelect);
  $('btn-apply-recommend').addEventListener('click', () => {
    if (state.recommendedTemplate) {
      applyTemplate(state.recommendedTemplate);
      hideTemplateRecommendation();
    }
  });
}

function setupActions() {
  $('btn-preview').addEventListener('click', handlePreview);
  $('btn-multi-preview').addEventListener('click', handleMultiPreview);
  $('btn-start').addEventListener('click', handleStart);
  $('btn-cancel').addEventListener('click', handleCancel);
  $('btn-close-modal').addEventListener('click', closeModal);
  $('preview-modal').addEventListener('click', (e) => {
    if (e.target.id === 'preview-modal') closeModal();
  });

  $('btn-close-multi-modal').addEventListener('click', closeMultiPreviewModal);
  $('multi-preview-modal').addEventListener('click', (e) => {
    if (e.target.id === 'multi-preview-modal') closeMultiPreviewModal();
  });
  $('btn-prev-sample').addEventListener('click', handlePrevSample);
  $('btn-next-sample').addEventListener('click', handleNextSample);

  window.api.onBatchProgress(updateProgress);
}

async function init() {
  setupDragAndDrop();
  setupFileSelectors();
  setupActions();
  initOrientationTabs();
  initResizeOptions();
  updateFileStats();
  updateActionButtons();
  await loadTemplates();
}

document.addEventListener('DOMContentLoaded', init);
