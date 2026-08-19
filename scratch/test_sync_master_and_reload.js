/**
 * test_sync_master_and_reload.js - QA Test Suite for Master Sync, Refresh & Diff Persistence
 */

const API_BASE = 'http://localhost:5000/api/projects';

function computeFileStatusMap(files, masterFiles) {
  const status = {};
  const masterPathMap = new Map((masterFiles || []).map(f => [f.filePath, f]));
  const workingPathMap = new Map((files || []).map(f => [f.filePath, f]));

  (files || []).forEach(wf => {
    const mf = masterPathMap.get(wf.filePath);
    if (!mf) {
      status[wf.filePath] = 'ADDED';
    } else if (mf.content !== wf.content) {
      status[wf.filePath] = 'MODIFIED';
    }
  });

  (masterFiles || []).forEach(mf => {
    if (!workingPathMap.has(mf.filePath)) {
      status[mf.filePath] = 'DELETED';
    }
  });

  return status;
}

console.log('🧪 Starting Master Sync & Reload Consistency QA Test...\n');

const projectId = `test-reload-sync-${Date.now()}`;
const ownerEmail = 'owner@obsidian.io';
const collabEmail = 'collab@obsidian.io';

// 1. Initialize Project
console.log('Step 1: Creating project repository...');
const initRes = await fetch(API_BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    title: 'Test Reload Sync Project',
    ownerEmail,
    languageEnv: 'PYTHON_3.11',
    collaborators: { [collabEmail]: 'EDITOR' }
  })
});
const initData = await initRes.json();
if (!initRes.ok) throw new Error(`Project creation failed: ${JSON.stringify(initData)}`);
console.log('  ✓ Project created with initial master baseline.');

// 2. Collaborator uploads folder with 3 files
console.log('\nStep 2: Collaborator imports multi-file folder...');
const folderFiles = [
  { fileId: 'f1', filePath: 'main.py', fileName: 'main.py', content: 'print("Init")', fileType: 'python' },
  { fileId: 'f2', filePath: 'src/app.py', fileName: 'app.py', content: 'def app(): pass', fileType: 'python' },
  { fileId: 'f3', filePath: 'src/utils.py', fileName: 'utils.py', content: 'def util(): pass', fileType: 'python' },
  { fileId: 'f4', filePath: 'docs/readme.md', fileName: 'readme.md', content: '# Docs', fileType: 'markdown' }
];

const updateRes = await fetch(`${API_BASE}/update-files`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    working_files: folderFiles,
    project_files: folderFiles,
    userEmail: collabEmail
  })
});
const updateData = await updateRes.json();
if (!updateRes.ok) throw new Error(`Folder upload failed: ${JSON.stringify(updateData)}`);
console.log('  ✓ Folder uploaded to working fork.');

// Verify diffs before master merge (3 files should be ADDED)
const getPreMerge = await fetch(`${API_BASE}/${projectId}?userEmail=${encodeURIComponent(ownerEmail)}`);
const preMergeProj = (await getPreMerge.json()).project;
const preMergeDiffs = computeFileStatusMap(preMergeProj.working_files, preMergeProj.master_project_files);
const addedCountPre = Object.values(preMergeDiffs).filter(s => s === 'ADDED').length;
console.log(`  ✓ Pre-merge diff count: ${addedCountPre} files marked ADDED.`);
if (addedCountPre !== 3) throw new Error(`Expected 3 ADDED files before merge, got ${addedCountPre}`);

// 3. Owner clicks "Save & Sync to Master"
console.log('\nStep 3: Owner commits "Save & Sync to Master"...');
const syncRes = await fetch(`${API_BASE}/sync-master`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    working_files: folderFiles,
    ownerEmail
  })
});
const syncData = await syncRes.json();
if (!syncRes.ok) throw new Error(`Master sync failed: ${JSON.stringify(syncData)}`);
console.log('  ✓ Master sync committed successfully.');

// 4. Simulate Page Reload (fetching fresh project state from server)
console.log('\nStep 4: Simulating page refresh / reload from server...');
const reloadRes = await fetch(`${API_BASE}/${projectId}?userEmail=${encodeURIComponent(ownerEmail)}`);
const reloadedProj = (await reloadRes.json()).project;

const postReloadDiffs = computeFileStatusMap(reloadedProj.working_files, reloadedProj.master_project_files);
const totalDiffsAfterReload = Object.keys(postReloadDiffs).length;

console.log(`  Post-reload diffs found: ${totalDiffsAfterReload}`);
if (totalDiffsAfterReload !== 0) {
  console.error('Diff map details:', postReloadDiffs);
  throw new Error(`Expected 0 diffs after page reload, but found ${totalDiffsAfterReload} pending diff(s)!`);
}
console.log('  ✓ Verified 0 pending diffs on page refresh after master sync.');

console.log('\n======================================================');
console.log('🎉 MASTER SYNC & RELOAD PERSISTENCE TESTS PASSED 100%!');
console.log('======================================================');
