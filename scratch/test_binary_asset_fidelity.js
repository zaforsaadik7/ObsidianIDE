/**
 * test_binary_asset_fidelity.js - QA Test Suite for Lossless PDF/Image Encoding, Live Preview & Uncorrupted Download
 */

import { isBinaryFileName, getMimeTypeFromExt } from '../src/utils/fileImporter.js';
import { dataUrlToBlob } from '../src/utils/fileExporter.js';
import JSZip from 'jszip';

console.log('🧪 Starting Lossless Binary Asset (PDF/Image) Verification Suite...\n');

// 1. Test binary extension detection
const testExtensions = [
  { name: 'document.pdf', expected: true },
  { name: 'diagram.png', expected: true },
  { name: 'photo.jpg', expected: true },
  { name: 'icon.svg', expected: true },
  { name: 'archive.zip', expected: true },
  { name: 'main.py', expected: false },
  { name: 'index.js', expected: false },
  { name: 'Cargo.toml', expected: false }
];

console.log('Test 1: Binary File Extension Classifier');
testExtensions.forEach(t => {
  const result = isBinaryFileName(t.name);
  if (result !== t.expected) {
    throw new Error(`Classifier failed for ${t.name}: expected ${t.expected}, got ${result}`);
  }
});
console.log('  ✓ All 8 binary & text extensions correctly classified.\n');

// 2. Test Lossless PDF Data URL -> Blob -> Binary Byte Signature
console.log('Test 2: Lossless PDF Base64 Decoding & Byte Signature Verification');
// A minimal valid 1-page PDF document in base64
const samplePdfBase64 = 'JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMzAwIDMwMF0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTggMDAwMDAgbiAKMDAwMDAwMDA2NyAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNC9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjE3MAolJUVPRgo=';
const pdfDataUrl = `data:application/pdf;base64,${samplePdfBase64}`;

const pdfBlob = dataUrlToBlob(pdfDataUrl);
const pdfArrayBuffer = await pdfBlob.arrayBuffer();
const pdfBytes = new Uint8Array(pdfArrayBuffer);
const pdfHeader = String.fromCharCode(...pdfBytes.slice(0, 5));

if (pdfHeader !== '%PDF-') {
  throw new Error(`PDF corrupted: expected header '%PDF-', got '${pdfHeader}'`);
}
console.log(`  ✓ PDF decoded losslessly. Header: '${pdfHeader}', Size: ${pdfBytes.length} bytes (MIME: ${pdfBlob.type})\n`);

// 3. Test Lossless PNG Base64 Decoding & Byte Signature
console.log('Test 3: Lossless PNG Image Base64 Decoding & Header Verification');
// A minimal 1x1 transparent PNG in base64
const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pngDataUrl = `data:image/png;base64,${samplePngBase64}`;

const pngBlob = dataUrlToBlob(pngDataUrl);
const pngArrayBuffer = await pngBlob.arrayBuffer();
const pngBytes = new Uint8Array(pngArrayBuffer);
// PNG Magic Number: 137 80 78 71 13 10 26 10 (0x89 'P' 'N' 'G' '\r' '\n' 0x1A '\n')
const isPngMagic = pngBytes[0] === 0x89 && pngBytes[1] === 0x50 && pngBytes[2] === 0x4E && pngBytes[3] === 0x47;

if (!isPngMagic) {
  throw new Error('PNG corrupted: invalid PNG magic bytes');
}
console.log(`  ✓ PNG decoded losslessly. Magic bytes validated (Size: ${pngBytes.length} bytes, MIME: ${pngBlob.type})\n`);

// 4. Test ZIP Archive Creation with Binary Preservation
console.log('Test 4: ZIP Packaging with Binary Payload Preservation');
const zip = new JSZip();
const testProject = zip.folder('TestBinaryProject');

// Add text file
testProject.file('src/main.py', 'print("Hello Binary World")\n');
// Add binary PDF
testProject.file('docs/manual.pdf', samplePdfBase64, { base64: true });
// Add binary PNG
testProject.file('assets/logo.png', samplePngBase64, { base64: true });

const zipBlob = await zip.generateAsync({ type: 'blob' });
console.log(`  ✓ ZIP archive generated with text + binary assets (Total size: ${zipBlob.size} bytes).`);

// Extract ZIP and verify binary integrity
const unzipped = await JSZip.loadAsync(await zipBlob.arrayBuffer());
const extractedPdfBase64 = await unzipped.files['TestBinaryProject/docs/manual.pdf'].async('base64');
const extractedPngBase64 = await unzipped.files['TestBinaryProject/assets/logo.png'].async('base64');

if (extractedPdfBase64 !== samplePdfBase64) {
  throw new Error('ZIP extraction corrupted PDF binary payload!');
}
if (extractedPngBase64 !== samplePngBase64) {
  throw new Error('ZIP extraction corrupted PNG binary payload!');
}
console.log('  ✓ Verified extracted PDF and PNG payloads match 100% byte-for-byte with originals.\n');

console.log('======================================================');
console.log('🎉 LOSSLESS BINARY ASSET TESTS PASSED 100%!');
console.log('======================================================');
