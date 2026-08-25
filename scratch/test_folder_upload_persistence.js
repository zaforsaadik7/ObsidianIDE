import assert from 'assert';
import { parseFlatArrayToTreeNodes } from '../src/utils/flatTreeParser.js';

async function testFolderUploadPersistence() {
  console.log("🧪 Testing Folder Upload Persistence & Server Sync Pipeline...");

  const BASE_URL = 'http://localhost:5000';
  const projectId = 'test_folder_persist_' + Date.now();
  const userEmail = 'test_owner@example.com';

  // 1. Initial project with 1 file
  const initialFiles = [
    {
      fileId: 'file_main',
      projectId,
      filePath: 'main.py',
      fileName: 'main.py',
      content: "print('Initial main')",
      fileType: 'python'
    }
  ];

  console.log("Step 1: Creating test project with initial files...");
  const initRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: initialFiles,
      master_project_files: initialFiles,
      userEmail,
      isOwner: true
    })
  });
  assert(initRes.ok, "Initial project save must succeed");

  // 2. Simulate user uploading a folder "my_dataset_pipeline" with multiple nested files & images
  console.log("\nStep 2: Simulating folder upload 'my_dataset_pipeline' with nested subfolders...");
  const folderUploadFiles = [
    {
      fileId: 'file_folder_1',
      projectId,
      filePath: 'my_dataset_pipeline/pipeline.py',
      fileName: 'pipeline.py',
      content: "# Pipeline runner\nimport pandas as pd",
      fileType: 'python',
      isBinary: false,
      size: 45
    },
    {
      fileId: 'file_folder_2',
      projectId,
      filePath: 'my_dataset_pipeline/modules/preprocessor.py',
      fileName: 'preprocessor.py',
      content: "# Preprocessor module\ndef clean_data(): pass",
      fileType: 'python',
      isBinary: false,
      size: 55
    },
    {
      fileId: 'file_folder_3',
      projectId,
      filePath: 'my_dataset_pipeline/data/input.csv',
      fileName: 'input.csv',
      content: "id,feature_1,feature_2\n1,10.5,20.3\n2,12.1,19.8",
      fileType: 'plaintext',
      isBinary: false,
      size: 52
    },
    {
      fileId: 'file_folder_4',
      projectId,
      filePath: 'my_dataset_pipeline/plots/correlation_matrix.png',
      fileName: 'correlation_matrix.png',
      content: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      fileType: 'image',
      isBinary: true,
      size: 112
    }
  ];

  const mergedFiles = [
    ...initialFiles,
    ...folderUploadFiles
  ];

  console.log(`Sending update-files for ${mergedFiles.length} total project files...`);
  const uploadRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: mergedFiles,
      master_project_files: mergedFiles,
      userEmail,
      isOwner: true
    })
  });
  assert(uploadRes.ok, "Folder upload update-files must succeed");

  // 3. Verify that GET /api/projects/:projectId returns the complete folder files
  console.log("\nStep 3: Polling project from backend repository to verify folder persistence...");
  const getRes = await fetch(`${BASE_URL}/api/projects/${projectId}?userEmail=${encodeURIComponent(userEmail)}`);
  assert(getRes.ok, "GET /api/projects/:projectId must return 200");
  const getData = await getRes.json();
  assert(getData.status === 'SUCCESS', "Project fetch status must be SUCCESS");
  assert(getData.project, "Project object must exist");

  const serverWorking = getData.project.working_files || [];
  console.log(`✓ Server returned ${serverWorking.length} files in working_files:`);
  serverWorking.forEach(f => console.log(`   - ${f.filePath} (${f.fileType})`));

  assert(serverWorking.length === 5, `Expected 5 files in working_files, received ${serverWorking.length}`);
  const serverFilePaths = serverWorking.map(f => f.filePath);
  assert(serverFilePaths.includes('main.py'), "main.py must exist");
  assert(serverFilePaths.includes('my_dataset_pipeline/pipeline.py'), "pipeline.py must exist");
  assert(serverFilePaths.includes('my_dataset_pipeline/modules/preprocessor.py'), "preprocessor.py must exist");
  assert(serverFilePaths.includes('my_dataset_pipeline/data/input.csv'), "input.csv must exist");
  assert(serverFilePaths.includes('my_dataset_pipeline/plots/correlation_matrix.png'), "correlation_matrix.png must exist");

  // 4. Test directory tree hierarchical parser
  console.log("\nStep 4: Verifying Directory Explorer Tree Hierarchy parser...");
  const tree = parseFlatArrayToTreeNodes(serverWorking);
  assert(tree.files.some(f => f.name === 'main.py'), "Root must contain main.py");
  assert(tree.children['my_dataset_pipeline'], "Root must contain folder 'my_dataset_pipeline'");
  assert(tree.children['my_dataset_pipeline'].files.some(f => f.name === 'pipeline.py'), "'my_dataset_pipeline' must contain pipeline.py");
  assert(tree.children['my_dataset_pipeline'].children['modules'], "'my_dataset_pipeline' must contain 'modules'");
  assert(tree.children['my_dataset_pipeline'].children['modules'].files.some(f => f.name === 'preprocessor.py'), "'modules' must contain preprocessor.py");
  assert(tree.children['my_dataset_pipeline'].children['data'].files.some(f => f.name === 'input.csv'), "'data' must contain input.csv");
  assert(tree.children['my_dataset_pipeline'].children['plots'].files.some(f => f.name === 'correlation_matrix.png'), "'plots' must contain correlation_matrix.png");

  console.log("✓ Directory Tree Parser verified: All folder and subfolder levels are intact and preserved!");

  console.log("\n==========================================================================");
  console.log("🎉 FOLDER UPLOAD & PERSISTENCE PIPELINE 100% VERIFIED AND WORKING!");
  console.log("==========================================================================\n");
}

testFolderUploadPersistence().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
