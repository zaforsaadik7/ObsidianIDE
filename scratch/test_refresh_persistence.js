import assert from 'assert';
import { parseFlatArrayToTreeNodes } from '../src/utils/flatTreeParser.js';

async function testRefreshPersistence() {
  console.log("🧪 Testing Complete Folder Upload Refresh Persistence & Role Lifecycle Flow...");

  const BASE_URL = 'http://localhost:5000';
  const projectId = 'test_refresh_persist_' + Date.now();
  const ownerEmail = 'owner_refresh@example.com';
  const editorEmail = 'editor_refresh@example.com';

  // Step 1: Owner initializes project with root main.py
  console.log("\nStep 1: Owner creates initial project...");
  const initialFiles = [
    {
      fileId: 'file_root_main',
      projectId,
      filePath: 'main.py',
      fileName: 'main.py',
      content: "print('Root project initialized')",
      fileType: 'python',
      isBinary: false,
      size: 30
    }
  ];

  const createRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: initialFiles,
      master_project_files: initialFiles,
      project_files: initialFiles,
      userEmail: ownerEmail,
      ownerEmail,
      collaborators: { [editorEmail]: 'EDITOR' },
      isOwner: true
    })
  });
  assert(createRes.ok, "Project creation must succeed");

  // Step 2: Editor uploads a full folder "ai_engine" with nested files
  console.log("\nStep 2: Editor uploads full folder 'ai_engine' with nested files...");
  const uploadedFolderFiles = [
    {
      fileId: 'file_ai_1',
      projectId,
      filePath: 'ai_engine/train.py',
      fileName: 'train.py',
      content: "# Model Trainer\nimport torch",
      fileType: 'python',
      isBinary: false,
      size: 28,
      lastModifiedBy: editorEmail
    },
    {
      fileId: 'file_ai_2',
      projectId,
      filePath: 'ai_engine/data/dataset.csv',
      fileName: 'dataset.csv',
      content: "feature1,feature2,target\n1.2,3.4,1\n5.6,7.8,0",
      fileType: 'plaintext',
      isBinary: false,
      size: 42,
      lastModifiedBy: editorEmail
    },
    {
      fileId: 'file_ai_3',
      projectId,
      filePath: 'ai_engine/visualizations/roc_curve.png',
      fileName: 'roc_curve.png',
      content: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      fileType: 'image',
      isBinary: true,
      size: 110,
      lastModifiedBy: editorEmail
    }
  ];

  const editorWorkingFiles = [
    ...initialFiles,
    ...uploadedFolderFiles
  ];

  const uploadRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: editorWorkingFiles,
      master_project_files: initialFiles, // Editor does not modify master
      project_files: initialFiles,
      userEmail: editorEmail,
      ownerEmail,
      collaborators: { [editorEmail]: 'EDITOR' },
      isOwner: false,
      pendingFork: true
    })
  });
  assert(uploadRes.ok, "Editor folder upload must succeed");

  // Step 3: Simulate Editor refreshing the page (fresh GET /api/projects/:projectId)
  console.log("\nStep 3: Simulating Editor refreshing the page (Fresh GET fetch)...");
  const editorRefreshRes = await fetch(`${BASE_URL}/api/projects/${projectId}?userEmail=${encodeURIComponent(editorEmail)}`);
  assert(editorRefreshRes.ok, "Editor GET project fetch must succeed");
  const editorRefreshData = await editorRefreshRes.json();
  const editorRefreshedWorking = editorRefreshData.project.working_files || [];
  const editorRefreshedMaster = editorRefreshData.project.master_project_files || [];

  console.log(`✓ After refresh, Editor working_files has ${editorRefreshedWorking.length} files:`);
  editorRefreshedWorking.forEach(f => console.log(`   - ${f.filePath} (${f.fileType})`));

  assert(editorRefreshedWorking.length === 4, `Editor must have 4 working files, got ${editorRefreshedWorking.length}`);
  assert(editorRefreshedMaster.length === 1, `Master baseline must remain 1 file before owner merge, got ${editorRefreshedMaster.length}`);
  assert(editorRefreshData.project.pendingFork === true, "pendingFork must be true for Editor");

  // Verify tree parsing preserves folder hierarchy on Editor side
  const tree = parseFlatArrayToTreeNodes(editorRefreshedWorking);
  assert(tree.children['ai_engine'], "ai_engine folder node must exist in tree");
  assert(tree.children['ai_engine'].files.some(f => f.name === 'train.py'), "train.py must exist in ai_engine");
  assert(tree.children['ai_engine'].children['data'].files.some(f => f.name === 'dataset.csv'), "dataset.csv must exist in ai_engine/data");
  assert(tree.children['ai_engine'].children['visualizations'].files.some(f => f.name === 'roc_curve.png'), "roc_curve.png must exist in ai_engine/visualizations");
  console.log("✓ Tree structure on Editor refresh is 100% correct!");

  // Step 4: Owner reviews and merges fork into Master
  console.log("\nStep 4: Owner saves and syncs fork into Master (/api/projects/sync-master)...");
  const ownerMergeRes = await fetch(`${BASE_URL}/api/projects/sync-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: editorWorkingFiles,
      ownerEmail
    })
  });
  assert(ownerMergeRes.ok, "Owner sync-master must succeed");

  // Step 5: Simulate Editor and Owner refreshing after Master merge
  console.log("\nStep 5: Simulating Editor refreshing after Owner Master merge...");
  const postMergeRes = await fetch(`${BASE_URL}/api/projects/${projectId}?userEmail=${encodeURIComponent(editorEmail)}`);
  assert(postMergeRes.ok, "Post-merge GET fetch must succeed");
  const postMergeData = await postMergeRes.json();
  const postMaster = postMergeData.project.master_project_files || [];
  const postWorking = postMergeData.project.working_files || [];

  console.log(`✓ Post-merge Master files count: ${postMaster.length}`);
  console.log(`✓ Post-merge Working files count: ${postWorking.length}`);
  console.log(`✓ Post-merge pendingFork flag: ${postMergeData.project.pendingFork}`);

  assert(postMaster.length === 4, "Master must now contain all 4 files including the uploaded folder");
  assert(postWorking.length === 4, "Working must contain all 4 files");
  assert(postMergeData.project.pendingFork === false, "pendingFork must be false");

  console.log("\n==========================================================================");
  console.log("🎉 REFRESH PERSISTENCE & FOLDER UPLOAD LIFECYCLE 100% VERIFIED!");
  console.log("==========================================================================\n");
}

testRefreshPersistence().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
