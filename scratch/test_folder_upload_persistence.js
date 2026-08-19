import assert from 'assert';

/**
 * ObsidianIDE QA Test Suite:
 * Collaborator Folder Upload Persistence & Owner Master Sync
 */

async function runFolderUploadTests() {
  console.log('🧪 Starting Folder Upload & Persistence Verification Suite...\n');

  const testProjectId = 'test-folder-sync-' + Date.now();
  const ownerEmail = 'owner@obsidian.io';
  const collabEmail = 'collab@obsidian.io';

  // 1. Initial State: Create Project with Owner and Collaborator
  console.log('Test 1: Initializing Project State with 1 file');
  const initRes = await fetch('http://localhost:5000/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: testProjectId,
      title: 'Test Folder Upload Project',
      ownerEmail,
      collaborators: { [collabEmail]: 'EDITOR' },
      languageEnv: 'PYTHON_3.11'
    })
  });
  assert.strictEqual(initRes.status, 201, 'Project creation must return 201');
  console.log('  ✓ Initial project created with Owner and Collaborator.');

  // 2. Collaborator uploads a folder "ProjectAlpha" with 3 nested files
  console.log('\nTest 2: Collaborator Uploads Multi-file Folder "ProjectAlpha"');
  const folderUploadFiles = [
    { fileId: 'f-1', filePath: 'main.py', fileName: 'main.py', content: 'print("Init")', fileType: 'python' },
    { fileId: 'f-2', filePath: 'ProjectAlpha/src/index.js', fileName: 'index.js', content: 'console.log("App");', fileType: 'javascript' },
    { fileId: 'f-3', filePath: 'ProjectAlpha/package.json', fileName: 'package.json', content: '{"name":"alpha"}', fileType: 'json' },
    { fileId: 'f-4', filePath: 'ProjectAlpha/utils/helper.py', fileName: 'helper.py', content: 'def help(): pass', fileType: 'python' }
  ];

  const uploadRes = await fetch('http://localhost:5000/api/projects/update-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: testProjectId,
      project_files: folderUploadFiles,
      working_files: folderUploadFiles,
      userEmail: collabEmail
    })
  });
  assert.strictEqual(uploadRes.status, 200, 'Folder upload /update-files must return 200');
  const uploadData = await uploadRes.json();
  console.log('update-files response:', uploadData);
  assert.strictEqual(uploadData.status, 'SUCCESS', 'Response must be SUCCESS');
  console.log('  ✓ Folder upload successfully received and saved by server.');

  // 3. Verify that the project persistence returns all 4 files (initial 1 + 3 folder files)
  console.log('\nTest 3: Verify Persistence — Folder Files Must NOT Vanish for Owner or Collaborator');
  const getResOwner = await fetch(`http://localhost:5000/api/projects/${testProjectId}?userEmail=${encodeURIComponent(ownerEmail)}`);
  assert.strictEqual(getResOwner.status, 200, 'GET /api/projects/:projectId for Owner must return 200');
  const getDataOwner = await getResOwner.json();
  console.log('Returned project data:', JSON.stringify(getDataOwner, null, 2));
  const returnedWorking = getDataOwner.project.working_files || getDataOwner.project.project_files;
  assert.strictEqual(returnedWorking.length, 4, `Expected 4 files, got ${returnedWorking.length}`);
  
  const filePaths = returnedWorking.map(f => f.filePath);
  assert(filePaths.includes('ProjectAlpha/src/index.js'), 'Must contain ProjectAlpha/src/index.js');
  assert(filePaths.includes('ProjectAlpha/package.json'), 'Must contain ProjectAlpha/package.json');
  assert(filePaths.includes('ProjectAlpha/utils/helper.py'), 'Must contain ProjectAlpha/utils/helper.py');
  console.log('  ✓ Verified all 3 folder files permanently exist in project repository for Owner.');

  const getResCollab = await fetch(`http://localhost:5000/api/projects/${testProjectId}?userEmail=${encodeURIComponent(collabEmail)}`);
  assert.strictEqual(getResCollab.status, 200, 'GET /api/projects/:projectId for Collaborator must return 200');
  const getDataCollab = await getResCollab.json();
  const collabWorking = getDataCollab.project.working_files || getDataCollab.project.project_files;
  assert.strictEqual(collabWorking.length, 4, `Expected 4 files for collaborator, got ${collabWorking.length}`);
  console.log('  ✓ Verified all 3 folder files permanently exist in project repository for Collaborator.');

  // 4. Owner Merges & Syncs Folder to Master Repository
  console.log('\nTest 4: Owner Merges Uploaded Folder to Master');
  const syncRes = await fetch('http://localhost:5000/api/projects/sync-master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: testProjectId,
      working_files: returnedWorking,
      ownerEmail
    })
  });
  assert.strictEqual(syncRes.status, 200, 'sync-master must return 200');
  const syncData = await syncRes.json();
  assert.strictEqual(syncData.master_project_files.length, 4, 'Master repository must have all 4 files');
  console.log('  ✓ Verified Owner successfully committed all folder files to Master.');

  console.log('\n======================================================');
  console.log('🎉 FOLDER UPLOAD PERSISTENCE TESTS PASSED 100%!');
  console.log('======================================================\n');
}

runFolderUploadTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
