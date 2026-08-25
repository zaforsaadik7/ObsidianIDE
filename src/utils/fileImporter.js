import JSZip from 'jszip';

/**
 * FileImporter — Local File, Folder Project, and ZIP Archive Import Utility for ObsidianIDE.
 *
 * Supports:
 * - Single/Multi file reading with text decoding and lossless base64 Data URL binary encoding.
 * - Directory project parsing with webkitRelativePath preserving full folder/subfolder hierarchies.
 * - ZIP archive decompression and recursive directory extraction via JSZip (preserving binary images & PDFs).
 * - Constraint pre-analysis (payload size, file counts, binary checks, large file warnings).
 */

export const FILE_CONSTRAINTS = {
  MAX_SINGLE_FILE_SIZE: 15 * 1024 * 1024, // 15 MB
  WARN_SINGLE_FILE_SIZE: 5 * 1024 * 1024,  // 5 MB
  MAX_TOTAL_IMPORT_SIZE: 50 * 1024 * 1024, // 50 MB
  WARN_TOTAL_IMPORT_SIZE: 25 * 1024 * 1024,// 25 MB
  MAX_FILE_COUNT: 250,                     // 250 files per batch
  WARN_FILE_COUNT: 100                     // 100 files warning
};

export const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico',
  'pdf', 'zip', 'tar', 'gz', 'rar', '7z',
  'bin', 'exe', 'mp4', 'webm', 'mp3', 'wav',
  'woff', 'woff2', 'ttf', 'eot'
]);

export const isBinaryFileName = (fileName = '') => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
};

export const getMimeTypeFromExt = (ext = '') => {
  const map = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    zip: 'application/zip',
    json: 'application/json',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    txt: 'text/plain'
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
};

/**
 * Format bytes to readable string (e.g. 1.45 MB, 320 KB)
 */
export const formatBytes = (bytes = 0) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Infer file language / type from extension
 */
export const inferFileType = (filePath = '') => {
  const ext = filePath.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    cs: 'csharp',
    html: 'html', htm: 'html',
    css: 'css', scss: 'css',
    json: 'json',
    md: 'markdown',
    txt: 'plaintext',
    svg: 'xml', xml: 'xml',
    sh: 'shell', bash: 'shell',
    php: 'php',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    pdf: 'pdf',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
    zip: 'archive'
  };
  return map[ext] || 'plaintext';
};

/**
 * Read a single File object as text or lossless Data URL
 */
export const readFileContent = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isBinary = isBinaryFileName(file.name);

    reader.onload = (e) => resolve(e.target.result || '');
    reader.onerror = (e) => reject(new Error(`Failed to read file: ${file.name}`));

    if (isBinary) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
};

export const readFileAsText = readFileContent;

/**
 * Process array of selected File objects (from regular file input)
 */
export const processLocalFiles = async (fileList, targetFolder = '') => {
  const files = Array.from(fileList);
  const results = [];
  const cleanTarget = targetFolder ? targetFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';

  for (const file of files) {
    const content = await readFileContent(file);
    const fileName = file.name.replace(/\\/g, '/').split('/').pop();
    const filePath = cleanTarget ? `${cleanTarget}/${fileName}` : fileName;
    const isBinary = isBinaryFileName(fileName);

    results.push({
      fileName,
      filePath,
      content,
      fileType: inferFileType(fileName),
      isBinary,
      size: file.size,
      lastModified: file.lastModified || Date.now()
    });
  }

  return results;
};

/**
 * Process a directory upload (from webkitdirectory input)
 * Preserves folder structure: e.g. folder "ProjectA/src/index.js" -> "ProjectA/src/index.js"
 */
export const processLocalFolder = async (fileList, targetFolder = '') => {
  const files = Array.from(fileList);
  const results = [];
  const cleanTarget = targetFolder ? targetFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';

  for (const file of files) {
    // webkitRelativePath contains "FolderName/subfolder/file.ext"
    const rawPath = (file.webkitRelativePath || file.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
    
    // Ignore hidden files / OS metadata like .DS_Store or .git
    if (rawPath.includes('/.') || rawPath.startsWith('.')) continue;

    const content = await readFileContent(file);
    const fileName = rawPath.split('/').pop();
    const filePath = cleanTarget ? `${cleanTarget}/${rawPath}` : rawPath;
    const isBinary = isBinaryFileName(fileName);

    results.push({
      fileName,
      filePath,
      content,
      fileType: inferFileType(fileName),
      isBinary,
      size: file.size,
      lastModified: file.lastModified || Date.now()
    });
  }

  return results;
};

/**
 * Unzip a ZIP archive and extract all files & folder paths (lossless for binary and text)
 */
export const processZipArchive = async (zipFile, targetFolder = '') => {
  const zip = new JSZip();
  const unzipped = await zip.loadAsync(zipFile);
  const results = [];
  const cleanTarget = targetFolder ? targetFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';

  const entries = Object.keys(unzipped.files);
  for (const relativePath of entries) {
    const entry = unzipped.files[relativePath];
    
    // Skip directory entries themselves and hidden files
    if (entry.dir || relativePath.includes('__MACOSX') || relativePath.includes('/.') || relativePath.startsWith('.')) {
      continue;
    }

    try {
      const cleanPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
      const fileName = cleanPath.split('/').pop();
      const ext = (fileName.split('.').pop() || '').toLowerCase();
      const isBinary = isBinaryFileName(fileName);

      let content = '';
      if (isBinary) {
        const base64Data = await entry.async('base64');
        const mimeType = getMimeTypeFromExt(ext);
        content = `data:${mimeType};base64,${base64Data}`;
      } else {
        content = await entry.async('string');
      }
      
      const filePath = cleanTarget ? `${cleanTarget}/${cleanPath}` : cleanPath;

      results.push({
        fileName,
        filePath,
        content,
        fileType: inferFileType(fileName),
        isBinary,
        size: entry._data?.uncompressedSize || content.length,
        lastModified: entry.date ? entry.date.getTime() : Date.now()
      });
    } catch (err) {
      console.warn(`Could not read entry ${relativePath}, skipping.`, err);
    }
  }

  return results;
};

/**
 * Pre-Analyze Import Constraints and Generate Diagnostics
 */
export const analyzeImportConstraints = (files = []) => {
  const totalCount = files.length;
  let totalSizeBytes = 0;
  const oversizedFiles = [];
  const warnings = [];
  const errors = [];

  files.forEach(f => {
    const size = f.size || (f.content ? f.content.length : 0);
    totalSizeBytes += size;

    if (size > FILE_CONSTRAINTS.MAX_SINGLE_FILE_SIZE) {
      errors.push(`File "${f.filePath}" (${formatBytes(size)}) exceeds max limit of ${formatBytes(FILE_CONSTRAINTS.MAX_SINGLE_FILE_SIZE)}.`);
    } else if (size > FILE_CONSTRAINTS.WARN_SINGLE_FILE_SIZE) {
      oversizedFiles.push({ path: f.filePath, size });
    }
  });

  if (totalCount > FILE_CONSTRAINTS.MAX_FILE_COUNT) {
    errors.push(`Import contains ${totalCount} files, exceeding max batch limit of ${FILE_CONSTRAINTS.MAX_FILE_COUNT} files.`);
  } else if (totalCount > FILE_CONSTRAINTS.WARN_FILE_COUNT) {
    warnings.push(`Importing ${totalCount} files in a single batch may take a few moments.`);
  }

  if (totalSizeBytes > FILE_CONSTRAINTS.MAX_TOTAL_IMPORT_SIZE) {
    errors.push(`Total import size (${formatBytes(totalSizeBytes)}) exceeds max payload limit of ${formatBytes(FILE_CONSTRAINTS.MAX_TOTAL_IMPORT_SIZE)}.`);
  } else if (totalSizeBytes > FILE_CONSTRAINTS.WARN_TOTAL_IMPORT_SIZE) {
    warnings.push(`Total import size (${formatBytes(totalSizeBytes)}) is large.`);
  }

  if (oversizedFiles.length > 0) {
    warnings.push(`${oversizedFiles.length} file(s) are larger than ${formatBytes(FILE_CONSTRAINTS.WARN_SINGLE_FILE_SIZE)}.`);
  }

  return {
    totalCount,
    totalSizeBytes,
    totalSizeFormatted: formatBytes(totalSizeBytes),
    oversizedFiles,
    warnings,
    errors,
    isValid: errors.length === 0
  };
};
