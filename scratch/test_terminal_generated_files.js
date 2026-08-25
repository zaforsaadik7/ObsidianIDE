import { WebSocket } from 'ws';
import assert from 'assert';
import { parseFlatArrayToTreeNodes } from '../src/utils/flatTreeParser.js';

async function testGeneratedFilesPipeline() {
  console.log("🧪 Testing Terminal Generated Files Auto-Sync & Directory Tree Pipeline...");

  const WS_URL = 'ws://localhost:5000/ws/terminal?projectId=test_xai_proj&userEmail=test@example.com';
  const ws = new WebSocket(WS_URL);

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      console.log("✓ WebSocket connected to terminal engine");
      resolve();
    });
    ws.on('error', reject);
  });

  // Prepare Python code that simulates an XAI / SHAP execution generating files in root and subdirectories
  const pythonScript = `
import os
import json

# 1. Create a root plot image
with open('shap_summary.png', 'wb') as f:
    # 1x1 transparent PNG bytes
    f.write(b'\\x89PNG\\r\\n\\x1a\\n\\x00\\x00\\x00\\rIHDR\\x00\\x00\\x00\\x01\\x00\\x00\\x00\\x01\\x08\\x06\\x00\\x00\\x00\\x1f\\x15c4\\x00\\x00\\x00\\nIDATx\\x9cc\\x00\\x01\\x00\\x00\\x05\\x00\\x01\\r\\n-\\xb4\\x00\\x00\\x00\\x00IEND\\xaeB\`\\x82')

# 2. Create subfolder and nested plot image
os.makedirs('outputs/plots', exist_ok=True)
with open('outputs/plots/shap_waterfall.png', 'wb') as f:
    f.write(b'\\x89PNG\\r\\n\\x1a\\n\\x00\\x00\\x00\\rIHDR\\x00\\x00\\x00\\x01\\x00\\x00\\x00\\x01\\x08\\x06\\x00\\x00\\x00\\x1f\\x15c4\\x00\\x00\\x00\\nIDATx\\x9cc\\x00\\x01\\x00\\x00\\x05\\x00\\x01\\r\\n-\\xb4\\x00\\x00\\x00\\x00IEND\\xaeB\`\\x82')

# 3. Create structured JSON report
metrics = {
    "model": "RandomForest_XAI",
    "shap_values_computed": 100,
    "top_features": ["age", "blood_pressure", "bmi"],
    "status": "COMPLETED"
}
with open('outputs/metrics.json', 'w') as f:
    json.dump(metrics, f, indent=2)

print("XAI Model Training & Plot Generation Complete.")
`;

  let syncedFilesReceived = null;

  const syncPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for workspace_files_synced event from terminal"));
    }, 15000);

    ws.on('message', (data) => {
      const text = data.toString();
      if (text.startsWith('{') && text.endsWith('}')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.type === 'workspace_files_synced' && Array.isArray(parsed.generatedFiles)) {
            syncedFilesReceived = parsed.generatedFiles;
            clearTimeout(timeout);
            resolve(parsed.generatedFiles);
          }
        } catch {}
      }
    });
  });

  console.log("Sending Python XAI script execution command to terminal...");
  ws.send(JSON.stringify({
    type: 'run_code',
    code: pythonScript,
    filePath: 'train_xai.py'
  }));

  const generatedFiles = await syncPromise;
  console.log(`✓ Received ${generatedFiles.length} generated/synced files from sandbox execution:`);
  generatedFiles.forEach(f => {
    console.log(`   - ${f.filePath} (binary: ${f.isBinary}, size: ${f.size} bytes)`);
  });

  // Verify file presence
  const filePaths = generatedFiles.map(f => f.filePath.replace(/\\/g, '/'));
  assert(filePaths.includes('shap_summary.png'), "Must contain root shap_summary.png");
  assert(filePaths.includes('outputs/plots/shap_waterfall.png'), "Must contain nested outputs/plots/shap_waterfall.png");
  assert(filePaths.includes('outputs/metrics.json'), "Must contain outputs/metrics.json");

  // Verify binary data URL encoding for images
  const pngFile = generatedFiles.find(f => f.filePath.includes('shap_summary.png'));
  assert(pngFile.isBinary === true, "PNG must be marked as binary");
  assert(pngFile.content.startsWith('data:image/png;base64,'), "PNG content must be base64 data URI for binary asset viewer");

  // Verify JSON text content
  const jsonFile = generatedFiles.find(f => f.filePath.includes('metrics.json'));
  assert(jsonFile.content.includes('"RandomForest_XAI"'), "JSON content must contain parsed JSON text");

  // Test Tree Parser with the generated files to ensure directory hierarchy works seamlessly
  console.log("\nTesting Directory Tree Parser with generated files...");
  const tree = parseFlatArrayToTreeNodes(generatedFiles);
  assert(tree.files.some(f => f.name === 'shap_summary.png'), "Root tree must contain shap_summary.png");
  assert(tree.children['outputs'], "Tree must have 'outputs' directory");
  assert(tree.children['outputs'].files.some(f => f.name === 'metrics.json'), "outputs directory must contain metrics.json");
  assert(tree.children['outputs'].children['plots'], "outputs directory must have 'plots' subfolder");
  assert(tree.children['outputs'].children['plots'].files.some(f => f.name === 'shap_waterfall.png'), "outputs/plots must contain shap_waterfall.png");

  console.log("✓ Directory Tree Parser structured all folders and subfolders perfectly!");

  ws.close();
  console.log("\n==========================================================================");
  console.log("🎉 TERMINAL CODE EXECUTION & AUTO-SYNCED DIRECTORY TREE 100% VERIFIED!");
  console.log("==========================================================================\n");
}

testGeneratedFilesPipeline().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
