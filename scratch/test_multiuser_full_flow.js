/**
 * test_multiuser_full_flow.js - End-to-End QA Test Suite for Multi-User Real-Time Sync,
 * Role Security Isolation, Folder Upload Review, Master Merge, and Reload Consistency.
 */

const API_BASE = 'http://localhost:5000/api/projects';

console.log('🧪 Starting End-to-End Multi-User Real-Time Sync & Role Security Verification...\n');

const projectId = `test-e2e-project-${Date.now()}`;
const ownerEmail = 'zafor@bubt.edu.bd';
const editorEmail = 'samia@bubt.edu.bd';

// ── Step 1: Owner Creates Project ──────────────────────────────────────────
console.log('Step 1: Owner initializes project...');
const createRes = await fetch(API_BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    title: 'Quantum_Router_E2E',
    ownerEmail,
    languageEnv: 'RUST_1.75',
    collaborators: { [editorEmail]: 'EDITOR' }
  })
});
const createData = await createRes.json();
if (!createRes.ok) throw new Error(`Project creation failed: ${JSON.stringify(createData)}`);
console.log('  ✓ Project created in backend repository.');

// ── Step 2: Editor Queries Project (Verify Role is EDITOR) ─────────────────
console.log('\nStep 2: Editor queries project baseline...');
const editorQueryRes = await fetch(`${API_BASE}/${projectId}?userEmail=${encodeURIComponent(editorEmail)}`);
const editorProjData = (await editorQueryRes.json()).project;
const editorRole = editorProjData.collaborators[editorEmail];
console.log(`  ✓ Editor verified. Role: '${editorRole}', Project Owner: '${editorProjData.ownerEmail}'`);
if (editorRole !== 'EDITOR') throw new Error(`Editor role corrupted! Expected 'EDITOR', got '${editorRole}'`);
if (editorProjData.ownerEmail !== ownerEmail) throw new Error(`Owner corrupted! Expected '${ownerEmail}', got '${editorProjData.ownerEmail}'`);

// ── Step 3: Editor Uploads Multi-file Folder ──────────────────────────────
console.log('\nStep 3: Editor uploads multi-file folder "NeuralNet"...');
const initialMasterFile = editorProjData.master_project_files[0];
const incomingFolderFiles = [
  initialMasterFile,
  {
    fileId: 'file-nn-1',
    projectId,
    filePath: 'NeuralNet/config.json',
    fileName: 'config.json',
    content: '{"layers": 64, "learningRate": 0.001}',
    fileType: 'json',
    lastModifiedBy: editorEmail,
    updatedAt: new Date().toISOString()
  },
  {
    fileId: 'file-nn-2',
    projectId,
    filePath: 'NeuralNet/weights.bin',
    fileName: 'weights.bin',
    content: 'data:application/octet-stream;base64,AQIDBAUGBwgJCg==',
    fileType: 'binary',
    lastModifiedBy: editorEmail,
    updatedAt: new Date().toISOString()
  },
  {
    fileId: 'file-nn-3',
    projectId,
    filePath: 'NeuralNet/model.rs',
    fileName: 'model.rs',
    content: 'pub fn forward() { println!("Propagating"); }',
    fileType: 'rust',
    lastModifiedBy: editorEmail,
    updatedAt: new Date().toISOString()
  }
];

const uploadRes = await fetch(`${API_BASE}/update-files`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    project_files: incomingFolderFiles,
    working_files: incomingFolderFiles,
    userEmail: editorEmail,
    ownerEmail: editorProjData.ownerEmail,
    collaborators: editorProjData.collaborators
  })
});
const uploadData = await uploadRes.json();
if (!uploadRes.ok) throw new Error(`Folder upload failed: ${JSON.stringify(uploadData)}`);
console.log('  ✓ Folder upload processed by backend store.');

// ── Step 4: Strict Role & Security Verification Post-Upload ────────────────
console.log('\nStep 4: Verifying role isolation post-upload...');
const verifyEditorRes = await fetch(`${API_BASE}/${projectId}?userEmail=${encodeURIComponent(editorEmail)}`);
const postUploadProj = (await verifyEditorRes.json()).project;

if (postUploadProj.ownerEmail !== ownerEmail) {
  throw new Error(`CRITICAL SECURITY FAILURE: Owner changed from '${ownerEmail}' to '${postUploadProj.ownerEmail}'!`);
}
if (postUploadProj.collaborators[editorEmail] !== 'EDITOR') {
  throw new Error(`CRITICAL SECURITY FAILURE: Editor escalated to '${postUploadProj.collaborators[editorEmail]}'!`);
}
console.log('  ✓ Verified Editor did NOT become Owner.');
console.log('  ✓ Verified Owner remains:', postUploadProj.ownerEmail);

// ── Step 5: Owner Queries Project (Must NOT be 403 Forbidden) ──────────────
console.log('\nStep 5: Owner accesses workspace to review folder changes...');
const ownerQueryRes = await fetch(`${API_BASE}/${projectId}?userEmail=${encodeURIComponent(ownerEmail)}`);
if (ownerQueryRes.status === 403) {
  throw new Error('CRITICAL BUG: Owner locked out with 403 Access Denied!');
}
const ownerProjData = (await ownerQueryRes.json()).project;
console.log(`  ✓ Owner access granted. Working files visible to Owner: ${ownerProjData.working_files.length}`);
if (ownerProjData.working_files.length !== 4) {
  throw new Error(`Expected Owner to see 4 working files, but found ${ownerProjData.working_files.length}`);
}

// ── Step 6: Diff Map Calculation in Owner's UI ─────────────────────────────
console.log('\nStep 6: Calculating GitHub Live Diff map in Owner workspace...');
function computeDiffs(working, master) {
  const diffs = {};
  const masterMap = new Map((master || []).map(f => [f.filePath, f]));
  const workingMap = new Map((working || []).map(f => [f.filePath, f]));

  (working || []).forEach(wf => {
    const mf = masterMap.get(wf.filePath);
    if (!mf) diffs[wf.filePath] = 'ADDED';
    else if (mf.content !== wf.content) diffs[wf.filePath] = 'MODIFIED';
  });

  (master || []).forEach(mf => {
    if (!workingMap.has(mf.filePath)) diffs[mf.filePath] = 'DELETED';
  });

  return diffs;
}

const preMergeDiffs = computeDiffs(ownerProjData.working_files, ownerProjData.master_project_files);
const changedCount = Object.keys(preMergeDiffs).length;
console.log(`  ✓ Diff map computed: ${changedCount} file(s) pending merge (3 ADDED).`);
if (changedCount !== 3) {
  throw new Error(`Expected 3 pending diffs, got ${changedCount}`);
}

// ── Step 7: Owner Commits "Save & Sync to Master" ───────────────────────────
console.log('\nStep 7: Owner merges working changes to Master repository...');
const syncMasterRes = await fetch(`${API_BASE}/sync-master`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    working_files: ownerProjData.working_files,
    ownerEmail
  })
});
const syncMasterData = await syncMasterRes.json();
if (!syncMasterRes.ok) throw new Error(`Master sync failed: ${JSON.stringify(syncMasterData)}`);
console.log('  ✓ Master sync committed to backend repository.');

// ── Step 8: Full Page Refresh Simulation (Must have 0 Diffs) ───────────────
console.log('\nStep 8: Simulating browser page reload from server...');
const reloadRes = await fetch(`${API_BASE}/${projectId}?userEmail=${encodeURIComponent(ownerEmail)}`);
const reloadedProject = (await reloadRes.json()).project;

const postReloadDiffs = computeDiffs(reloadedProject.working_files, reloadedProject.master_project_files);
const diffCountOnReload = Object.keys(postReloadDiffs).length;
console.log(`  ✓ Post-reload diffs found: ${diffCountOnReload}`);
if (diffCountOnReload !== 0) {
  throw new Error(`Reload consistency failed: expected 0 diffs on refresh, found ${diffCountOnReload}!`);
}

console.log('\n================================================================');
console.log('🎉 COMPLETE MULTI-USER REAL-TIME E2E SUITE PASSED 100%!');
console.log('================================================================');
