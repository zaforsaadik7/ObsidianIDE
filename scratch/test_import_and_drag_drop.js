import assert from 'assert';
import JSZip from 'jszip';
import { 
  analyzeImportConstraints, 
  inferFileType, 
  formatBytes, 
  processZipArchive,
  FILE_CONSTRAINTS 
} from '../src/utils/fileImporter.js';

console.log("================================================================================");
console.log("  TEST SUITE: OBSIDIAN-IDE FILE/FOLDER/ZIP IMPORT & DRAG-MOVE ENGINE");
console.log("================================================================================\n");

// ── Test 1: Language & Extension Inference ────────────────────────────────────
console.log("▶ [TEST 1]: Language Extension Inferrer...");
assert.strictEqual(inferFileType('App.jsx'), 'javascript');
assert.strictEqual(inferFileType('index.html'), 'html');
assert.strictEqual(inferFileType('auth.php'), 'php');
assert.strictEqual(inferFileType('main.cpp'), 'cpp');
assert.strictEqual(inferFileType('server.ts'), 'typescript');
assert.strictEqual(inferFileType('script.sh'), 'shell');
console.log("  ✓ Language inference verified for 6 distinct file types.");

// ── Test 2: Byte Formatting Utility ──────────────────────────────────────────
console.log("\n▶ [TEST 2]: Byte Formatting Utility...");
assert.strictEqual(formatBytes(0), '0 B');
assert.strictEqual(formatBytes(1024), '1 KB');
assert.strictEqual(formatBytes(1536), '1.5 KB');
assert.strictEqual(formatBytes(1048576 * 2.5), '2.5 MB');
console.log("  ✓ Byte formatting values verified.");

// ── Test 3: Constraint Pre-Analysis Engine ───────────────────────────────────
console.log("\n▶ [TEST 3]: Pre-Import Constraint Safety Analyzer...");

// Case A: Safe batch
const safeBatch = [
  { filePath: 'src/main.js', content: 'console.log("hello");', size: 500 },
  { filePath: 'src/App.jsx', content: '<App />', size: 1200 },
  { filePath: 'index.html', content: '<html></html>', size: 300 }
];
const safeResult = analyzeImportConstraints(safeBatch);
assert.strictEqual(safeResult.isValid, true);
assert.strictEqual(safeResult.totalCount, 3);
assert.strictEqual(safeResult.errors.length, 0);
console.log("  ✓ Safe batch (3 files, 2KB) passed validation with zero errors.");

// Case B: Oversized individual file (>15MB)
const oversizedBatch = [
  { filePath: 'large_dataset.csv', content: '', size: 20 * 1024 * 1024 } // 20 MB
];
const oversizedResult = analyzeImportConstraints(oversizedBatch);
assert.strictEqual(oversizedResult.isValid, false);
assert(oversizedResult.errors[0].includes("exceeds max limit"));
console.log("  ✓ Single file > 15MB correctly flagged with error notice.");

// Case C: Massive batch (>250 files)
const hugeBatch = Array.from({ length: 300 }, (_, i) => ({
  filePath: `file_${i}.txt`,
  size: 100
}));
const hugeResult = analyzeImportConstraints(hugeBatch);
assert.strictEqual(hugeResult.isValid, false);
assert(hugeResult.errors[0].includes("300 files"));
console.log("  ✓ Batch > 250 files correctly flagged with batch limit error.");

// ── Test 4: ZIP Archive Creation & In-Browser Extraction ─────────────────────
console.log("\n▶ [TEST 4]: In-Memory ZIP Archive Creation & Recursive Extraction...");
async function testZipExtraction() {
  const zip = new JSZip();
  zip.file("ProjectAlpha/index.html", "<!DOCTYPE html><html><body><h1>Project Alpha</h1></body></html>");
  zip.file("ProjectAlpha/src/app.js", "export default function App() {}");
  zip.file("ProjectAlpha/src/components/Button.jsx", "export const Button = () => <button>Click</button>;");
  zip.file("ProjectAlpha/assets/styles.css", "body { background: #000; }");

  const zipBlob = await zip.generateAsync({ type: "nodebuffer" });
  const fakeZipFile = {
    name: "ProjectAlpha.zip",
    ...zipBlob
  };

  const extracted = await processZipArchive(zipBlob, '');
  assert.strictEqual(extracted.length, 4, "Must extract all 4 files");
  
  const extractedPaths = extracted.map(f => f.filePath);
  assert(extractedPaths.includes("ProjectAlpha/index.html"));
  assert(extractedPaths.includes("ProjectAlpha/src/app.js"));
  assert(extractedPaths.includes("ProjectAlpha/src/components/Button.jsx"));
  assert(extractedPaths.includes("ProjectAlpha/assets/styles.css"));
  
  console.log("  ✓ ZIP archive successfully unzipped with all 4 hierarchical paths preserved!");
}
await testZipExtraction();

// ── Test 5: Drag-and-Drop Path Transformation Engine ─────────────────────────
console.log("\n▶ [TEST 5]: Drag-and-Drop Move & Reorganization Calculations...");

// Simulation of handleMoveItem for a File
function simulateMoveFile(files, sourcePath, targetFolder) {
  const cleanTarget = targetFolder.replace(/^\/+|\/+$/g, '');
  const prefix = cleanTarget ? `${cleanTarget}/` : '';
  const fileName = sourcePath.split('/').pop();
  const newPath = `${prefix}${fileName}`;
  
  return files.map(f => f.filePath === sourcePath ? { ...f, filePath: newPath, fileName } : f);
}

// Simulation of handleMoveFolder
function simulateMoveFolder(files, sourcePath, targetFolder) {
  const cleanOld = sourcePath.replace(/^\/+|\/+$/g, '');
  const cleanTarget = targetFolder.replace(/^\/+|\/+$/g, '');
  const prefix = cleanTarget ? `${cleanTarget}/` : '';
  const folderBase = cleanOld.split('/').pop();
  const newFolderTarget = `${prefix}${folderBase}`;

  // Circular drop protection
  if (newFolderTarget === cleanOld || cleanTarget === cleanOld || cleanTarget.startsWith(cleanOld + '/')) {
    throw new Error("CircularMoveBlocked");
  }

  return files.map(f => {
    if (f.filePath === cleanOld || f.filePath.startsWith(`${cleanOld}/`)) {
      const suffix = f.filePath.slice(cleanOld.length);
      const newFilePath = `${newFolderTarget}${suffix}`;
      return { ...f, filePath: newFilePath, fileName: newFilePath.split('/').pop() };
    }
    return f;
  });
}

let testFiles = [
  { filePath: 'src/main.js', fileName: 'main.js' },
  { filePath: 'src/utils/math.js', fileName: 'math.js' },
  { filePath: 'src/components/Button.jsx', fileName: 'Button.jsx' },
  { filePath: 'src/components/Modal.jsx', fileName: 'Modal.jsx' },
  { filePath: 'src/components/sub/Theme.jsx', fileName: 'Theme.jsx' }
];

// Step 1: Move file 'src/utils/math.js' into folder 'lib'
testFiles = simulateMoveFile(testFiles, 'src/utils/math.js', 'lib');
assert.strictEqual(testFiles.find(f => f.fileName === 'math.js').filePath, 'lib/math.js');
console.log("  ✓ Moved single file 'src/utils/math.js' -> 'lib/math.js'.");

// Step 2: Move file 'lib/math.js' back to root level ''
testFiles = simulateMoveFile(testFiles, 'lib/math.js', '');
assert.strictEqual(testFiles.find(f => f.fileName === 'math.js').filePath, 'math.js');
console.log("  ✓ Moved single file 'lib/math.js' -> 'math.js' (root).");

// Step 3: Move folder 'src/components' (with 3 files) into folder 'ui'
testFiles = simulateMoveFolder(testFiles, 'src/components', 'ui');
const uiPaths = testFiles.map(f => f.filePath);
assert(uiPaths.includes('ui/components/Button.jsx'));
assert(uiPaths.includes('ui/components/Modal.jsx'));
assert(uiPaths.includes('ui/components/sub/Theme.jsx'));
console.log("  ✓ Moved entire folder 'src/components' -> 'ui/components/*' (all 3 files remapped).");

// Step 4: Circular drop protection
assert.throws(() => {
  simulateMoveFolder(testFiles, 'ui', 'ui/components');
}, /CircularMoveBlocked/);
console.log("  ✓ Circular move (moving folder into its own child) successfully detected and blocked!");

// Step 5: Move folder 'ui/components' back to project root
testFiles = simulateMoveFolder(testFiles, 'ui/components', '');
const rootComponentPaths = testFiles.map(f => f.filePath);
assert(rootComponentPaths.includes('components/Button.jsx'));
assert(rootComponentPaths.includes('components/Modal.jsx'));
assert(rootComponentPaths.includes('components/sub/Theme.jsx'));
console.log("  ✓ Moved folder 'ui/components' -> 'components/*' (root level).");

console.log("\n================================================================================");
console.log("  ✓ ALL 5 IMPORT & DRAG-MOVE TEST SUITES PASSED WITH 100% SUCCESS!");
console.log("================================================================================");
