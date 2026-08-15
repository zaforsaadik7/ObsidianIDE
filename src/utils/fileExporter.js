import JSZip from 'jszip';

/**
 * fileExporter.js - Multi-Format File & Project Export Engine for ObsidianIDE
 *
 * Supports:
 * 1. Single File Export:
 *    - Original Format (.cpp, .py, .java, .png, .pdf, etc.) with lossless binary decoding.
 *    - Plain Text (.txt)
 *    - Markdown Document (.md)
 *    - Word Document (.doc)
 * 2. Full Project Export:
 *    - Compressed ZIP Archive (.zip) with binary image/PDF preservation.
 *    - Structured JSON Manifest (.json)
 */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dataUrlToBlob(dataUrl, defaultMime = 'application/octet-stream') {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return new Blob([dataUrl || ''], { type: defaultMime });
  }
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : defaultMime;
  const byteString = atob(parts[1] || '');
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new Blob([uint8Array], { type: mime });
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Export a single file in one of the 4 formats: 'original' | 'txt' | 'md' | 'doc'
 */
export function exportSingleFile(fileObj, format = 'original') {
  if (!fileObj) return;
  const content = fileObj.content || '';
  const fullPath = fileObj.filePath || 'untitled.txt';
  const fileName = fullPath.split('/').pop();
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const ext = fileName.split('.').pop() || 'txt';
  const isDataUrl = typeof content === 'string' && content.startsWith('data:');

  switch (format) {
    case 'txt': {
      const blob = isDataUrl ? dataUrlToBlob(content, 'text/plain') : new Blob([content], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${baseName}.txt`);
      break;
    }
    case 'md': {
      const mdHeader = `# ${fileName}\n*Exported from ObsidianIDE on ${new Date().toLocaleDateString()}*\n\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
      const blob = new Blob([mdHeader], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, `${baseName}.md`);
      break;
    }
    case 'doc': {
      const docHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${escapeHtml(fileName)}</title>
  <style>
    body { font-family: 'Consolas', 'Courier New', monospace; font-size: 10pt; line-height: 1.4; color: #1E293B; background: #FFFFFF; }
    .header-box { font-family: 'Segoe UI', Arial, sans-serif; border-bottom: 2px solid #0284C7; padding-bottom: 8px; margin-bottom: 16px; }
    .title { font-size: 16pt; font-weight: bold; color: #0369A1; margin: 0; }
    .meta { font-size: 9pt; color: #64748B; margin-top: 4px; }
    .code-container { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 14px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <div class="header-box">
    <div class="title">${escapeHtml(fileName)}</div>
    <div class="meta">Path: ${escapeHtml(fullPath)} | Exported from ObsidianIDE on ${new Date().toLocaleString()}</div>
  </div>
  <div class="code-container">${escapeHtml(content)}</div>
</body>
</html>`;
      const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
      downloadBlob(blob, `${baseName}.doc`);
      break;
    }
    case 'original':
    default: {
      if (isDataUrl) {
        const blob = dataUrlToBlob(content);
        downloadBlob(blob, fileName);
      } else {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, fileName);
      }
      break;
    }
  }
}

/**
 * Package an entire project's files into a compressed ZIP file and download it.
 */
export async function exportProjectZip(files = [], projectTitle = 'Project_Archive') {
  if (!files || files.length === 0) {
    alert('Workspace is empty. No files to package.');
    return;
  }

  const zip = new JSZip();
  const safeProjectName = projectTitle.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Obsidian_Project';
  const rootFolder = zip.folder(safeProjectName);

  files.forEach((file) => {
    if (!file || !file.filePath) return;
    const cleanPath = file.filePath.replace(/^\/+/, '');
    const content = file.content || '';

    if (typeof content === 'string' && content.startsWith('data:')) {
      const base64Payload = content.split(',')[1];
      rootFolder.file(cleanPath, base64Payload, { base64: true });
    } else {
      rootFolder.file(cleanPath, content);
    }
  });

  // Add README.md manifest inside the ZIP
  const readmeContent = `# ${projectTitle}
Exported from **ObsidianIDE** on ${new Date().toLocaleString()}.

## Workspace Files:
${files.map(f => `- \`${f.filePath}\` (${f.fileType || 'code'})`).join('\n')}

---
*Generated by ObsidianIDE - Collaborative Substrate*
`;
  rootFolder.file('README.md', readmeContent);

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  downloadBlob(zipBlob, `${safeProjectName}.zip`);
}
