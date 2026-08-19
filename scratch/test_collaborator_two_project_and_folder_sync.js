/**
 * test_collaborator_two_project_and_folder_sync.js - QA Test Suite for:
 * 1. Single Project Card on Collaborator Dashboard with Authentic Role (No Ghost "OWNER" Mock)
 * 2. Uploaded Folder Immediately Visible in Owner Account for Save & Sync Review
 */

const API_BASE = 'http://localhost:5000/api/projects';

console.log('🧪 Starting Collaborator Dashboard Role & Owner Folder Review QA Test Suite...\n');

const projectId = `test-folder-sync-${Date.now()}`;
const ownerEmail = 'chief_owner@obsidian.io';
const collaboratorEmail = 'team_editor@obsidian.io';

// ── Test 1: Project Creation with 1 Baseline File ──────────────────────────
console.log('Test 1: Owner creates project repository with baseline file...');
const createRes = await fetch(API_BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    title: 'Alpha_Pipeline',
    ownerEmail,
    languageEnv: 'PYTHON_3.11',
    collaborators: { [collaboratorEmail]: 'EDITOR' }
  })
});
const createData = await createRes.json();
if (!createRes.ok) throw new Error(`Project creation failed: ${JSON.stringify(createData)}`);
console.log('  ✓ Project created with Master baseline.');

// ── Test 2: Collaborator Dashboard Query (Verify Exactly 1 Project with Role EDITOR) ──
console.log('\nTest 2: Collaborator queries dashboard project list...');
const collabListRes = await fetch(`${API_BASE}?email=${encodeURIComponent(collaboratorEmail)}`);
const collabListData = await collabListRes.json();
const collabProjects = collabListData.projects || [];

console.log(`  Collaborator project count returned: ${collabProjects.length}`);
if (collabProjects.length !== 1) {
  throw new Error(`Expected exactly 1 project on Collaborator dashboard, found ${collabProjects.length}!`);
}

const collabProject = collabProjects[0];
console.log(`  Collaborator role on project '${collabProject.title}': '${collabProject.userRole}'`);
if (collabProject.userRole !== 'EDITOR') {
  throw new Error(`Role escalation error: expected 'EDITOR', but got '${collabProject.userRole}'!`);
}
console.log('  ✓ Verified exactly 1 project card on collaborator dashboard with role EDITOR.');

// ── Test 3: Collaborator Uploads Folder with 3 Files ────────────────────────
console.log('\nTest 3: Collaborator imports folder "DataEngine" with 3 files...');
const initialMasterFile = collabProject.master_project_files[0];
const folderFiles = [
  initialMasterFile,
  {
    fileId: `file_${Date.now()}_1`,
    projectId,
    filePath: 'DataEngine/loader.py',
    fileName: 'loader.py',
    content: 'def load_data(): pass',
    fileType: 'python',
    lastModifiedBy: collaboratorEmail,
    updatedAt: new Date().toISOString()
  },
  {
    fileId: `file_${Date.now()}_2`,
    projectId,
    filePath: 'DataEngine/parser.py',
    fileName: 'parser.py',
    content: 'def parse_data(): pass',
    fileType: 'python',
    lastModifiedBy: collaboratorEmail,
    updatedAt: new Date().toISOString()
  },
  {
    fileId: `file_${Date.now()}_3`,
    projectId,
    filePath: 'DataEngine/config.yaml',
    fileName: 'config.yaml',
    content: 'version: 2.0',
    fileType: 'yaml',
    lastModifiedBy: collaboratorEmail,
    updatedAt: new Date().toISOString()
  }
];

const updateRes = await fetch(`${API_BASE}/update-files`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    project_files: folderFiles,
    working_files: folderFiles,
    master_project_files: [initialMasterFile],
    userEmail: collaboratorEmail,
    ownerEmail,
    collaborators: { [collaboratorEmail]: 'EDITOR', [ownerEmail]: 'OWNER' }
  })
});
const updateData = await updateRes.json();
if (!updateRes.ok) throw new Error(`Folder upload failed: ${JSON.stringify(updateData)}`);
console.log('  ✓ Folder files uploaded to working fork.');

// ── Test 4: Owner Queries Workspace (Must Show Folder & 3 Pending Diff Badges) ──
console.log('\nTest 4: Owner accesses repository to review uploaded folder...');
const ownerGetRes = await fetch(`${API_BASE}/${projectId}?userEmail=${encodeURIComponent(ownerEmail)}`);
if (ownerGetRes.status === 403) throw new Error('Owner was blocked with 403 Forbidden!');
const ownerProjData = (await ownerGetRes.json()).project;

console.log(`  Owner working files count: ${ownerProjData.working_files.length}`);
console.log(`  Owner master files baseline count: ${ownerProjData.master_project_files.length}`);

if (ownerProjData.working_files.length !== 4) {
  throw new Error(`Expected 4 working files in Owner workspace, got ${ownerProjData.working_files.length}!`);
}
if (ownerProjData.master_project_files.length !== 1) {
  throw new Error(`Expected 1 master baseline file in Owner workspace, got ${ownerProjData.master_project_files.length}!`);
}

// Compute Diffs in Owner Workspace
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

const ownerDiffs = computeDiffs(ownerProjData.working_files, ownerProjData.master_project_files);
const pendingCount = Object.keys(ownerDiffs).length;
console.log(`  Pending merge diffs visible to Owner: ${pendingCount} files.`);

if (pendingCount !== 3) {
  throw new Error(`Expected 3 ADDED diffs visible to Owner for Save & Sync, found ${pendingCount}!`);
}
console.log('  ✓ Verified all 3 uploaded folder files are flagged as ADDED and ready for Owner Save & Sync.');

// ── Test 5: Owner Merges to Master & Verifies 0 Diffs on Reload ──────────────
console.log('\nTest 5: Owner commits "Save & Sync to Master"...');
const syncRes = await fetch(`${API_BASE}/sync-master`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId,
    working_files: ownerProjData.working_files,
    ownerEmail
  })
});
const syncData = await syncRes.json();
if (!syncRes.ok) throw new Error(`Master sync failed: ${JSON.stringify(syncData)}`);

// Reload check
const reloadRes = await fetch(`${API_BASE}/${projectId}?userEmail=${encodeURIComponent(ownerEmail)}`);
const reloadedProj = (await reloadRes.json()).project;
const postReloadDiffs = computeDiffs(reloadedProj.working_files, reloadedProj.master_project_files);
console.log(`  Post-reload diffs found: ${Object.keys(postReloadDiffs).length}`);
if (Object.keys(postReloadDiffs).length !== 0) {
  throw new Error('Master sync failed to reset diffs to 0 on reload!');
}
console.log('  ✓ Verified 0 pending diffs after Master sync.');

console.log('\n================================================================');
console.log('🎉 COLLABORATOR DASHBOARD & OWNER FOLDER REVIEW TESTS PASSED 100%!');
console.log('================================================================');
