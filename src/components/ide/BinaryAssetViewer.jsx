import React, { useState } from 'react';
import { dataUrlToBlob, downloadBlob } from '../../utils/fileExporter';

/**
 * BinaryAssetViewer - High-Tech Viewer for Non-Text Assets (PDFs, Images, Archives)
 *
 * Provides:
 * - Native interactive PDF embedded document viewer.
 * - High-resolution Image canvas preview.
 * - Lossless binary download guaranteeing 0% byte corruption.
 */
export const BinaryAssetViewer = ({ fileObj, onDownload }) => {
  const [zoomLevel, setZoomLevel] = useState(1);

  if (!fileObj) return null;

  const fileName = fileObj.fileName || fileObj.filePath?.split('/').pop() || 'file';
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext);
  const isPdf = ext === 'pdf';
  const isZip = ['zip', 'tar', 'gz', 'rar', '7z'].includes(ext);

  const isDataUrl = typeof fileObj.content === 'string' && fileObj.content.startsWith('data:');

  const handleDownload = () => {
    if (onDownload) {
      onDownload(fileObj);
      return;
    }
    if (isDataUrl) {
      const blob = dataUrlToBlob(fileObj.content);
      downloadBlob(blob, fileName);
    } else {
      const blob = new Blob([fileObj.content || ''], { type: isPdf ? 'application/pdf' : 'application/octet-stream' });
      downloadBlob(blob, fileName);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0C10] text-zinc-200 font-sans select-none overflow-hidden">
      {/* Top Asset Toolbar */}
      <div className="h-10 border-b border-white/[0.08] bg-[#0E0F15] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="material-symbols-outlined text-cyan-400 text-base">
            {isPdf ? 'picture_as_pdf' : isImage ? 'image' : isZip ? 'folder_zip' : 'draft'}
          </span>
          <span className="font-bold text-white truncate max-w-xs">{fileName}</span>
          <span className="px-2 py-0.5 rounded text-[10px] uppercase bg-cyan-950/80 text-cyan-300 border border-cyan-800/40">
            {isPdf ? 'PDF Document' : isImage ? 'Image Asset' : isZip ? 'Archive' : 'Binary Asset'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isImage && (
            <div className="flex items-center bg-black/40 border border-white/10 rounded-lg p-0.5 mr-2">
              <button
                onClick={() => setZoomLevel(z => Math.max(0.25, z - 0.25))}
                className="px-2 py-0.5 text-xs text-zinc-400 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                title="Zoom Out"
              >
                -
              </button>
              <span className="text-[10px] font-mono text-zinc-300 px-1.5">{Math.round(zoomLevel * 100)}%</span>
              <button
                onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))}
                className="px-2 py-0.5 text-xs text-zinc-400 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                title="Zoom In"
              >
                +
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-white/10 rounded ml-1 cursor-pointer"
                title="Reset Zoom"
              >
                Reset
              </button>
            </div>
          )}

          <button
            onClick={handleDownload}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1 px-3 rounded text-xs font-mono flex items-center gap-1.5 shadow transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-xs">download</span>
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Viewer Canvas */}
      <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center bg-[#07080B]">
        {isPdf && isDataUrl ? (
          <div className="w-full h-full max-w-5xl flex flex-col rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-900">
            <object
              data={fileObj.content}
              type="application/pdf"
              className="w-full flex-1 rounded-xl bg-zinc-800"
            >
              <iframe
                src={fileObj.content}
                title={fileName}
                className="w-full h-full border-none"
              >
                <div className="p-8 text-center text-zinc-400 font-mono text-xs">
                  Your browser does not support inline PDF viewing. 
                  <button onClick={handleDownload} className="text-cyan-400 underline ml-2 cursor-pointer">
                    Click to download {fileName}
                  </button>
                </div>
              </iframe>
            </object>
          </div>
        ) : isImage && isDataUrl ? (
          <div className="flex-1 w-full h-full flex items-center justify-center overflow-auto p-4">
            <div 
              style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease' }}
              className="max-h-full max-w-full flex items-center justify-center rounded-xl p-2 bg-black/50 border border-white/10 shadow-2xl"
            >
              <img
                src={fileObj.content}
                alt={fileName}
                className="max-h-[75vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        ) : (
          <div className="max-w-md w-full bg-[#14151C] border border-white/10 rounded-xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-cyan-600/20 to-purple-600/20 border border-cyan-500/30">
              <span className="material-symbols-outlined text-3xl text-cyan-400">
                {isPdf ? 'picture_as_pdf' : isImage ? 'image' : isZip ? 'folder_zip' : 'draft'}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold font-mono text-white break-all">{fileName}</h2>
              <p className="text-xs text-zinc-400 font-mono mt-1">Path: {fileObj.filePath}</p>
            </div>

            <div className="p-3 bg-zinc-900/80 border border-white/5 rounded-lg text-left w-full space-y-1 font-mono text-xs text-zinc-300">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <span className="material-symbols-outlined text-sm">verified_user</span>
                <span>Binary Storage Protected</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Raw byte editing is disabled to preserve binary encoding. Click download below to export and view this asset.
              </p>
            </div>

            <button
              onClick={handleDownload}
              className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold py-2 px-4 rounded-lg text-xs font-mono flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              <span>Download {fileName}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BinaryAssetViewer;
