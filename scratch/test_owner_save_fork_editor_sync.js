import assert from 'assert';

async function testOwnerSaveForkEditorSync() {
  console.log("🧪 Testing Owner Save Fork -> Editor Pending State Clearing Flow...");

  const BASE_URL = 'http://localhost:5000';
  const projectId = 'test_fork_clear_' + Date.now();
  const ownerEmail = 'owner@example.com';
  const editorEmail = 'editor@example.com';

  // Step 1: Owner creates project
  console.log("\nStep 1: Owner creates project with baseline main.py...");
  const initialFiles = [
    {
      fileId: 'file_main',
      projectId,
      filePath: 'main.py',
      fileName: 'main.py',
      content: "print('Initial baseline')",
      fileType: 'python'
    }
  ];

  const initRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: initialFiles,
      master_project_files: initialFiles,
      userEmail: ownerEmail,
      ownerEmail,
      collaborators: { [editorEmail]: 'EDITOR' },
      isOwner: true
    })
  });
  assert(initRes.ok, "Initial project creation must succeed");

  // Step 2: Editor modifies main.py and requests fork
  console.log("\nStep 2: Editor edits main.py and submits fork request...");
  const editedFiles = [
    {
      fileId: 'file_main',
      projectId,
      filePath: 'main.py',
      fileName: 'main.py',
      content: "print('Edited by Editor - feature branch')",
      fileType: 'python',
      lastModifiedBy: editorEmail
    }
  ];

  const forkRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: editedFiles,
      master_project_files: initialFiles, // Master is still initial
      userEmail: editorEmail,
      ownerEmail,
      isOwner: false
    })
  });
  assert(forkRes.ok, "Fork submission must succeed");

  // Step 3: Verify editor sees fork difference (master != working)
  console.log("\nStep 3: Verifying project state has fork differences before owner merges...");
  const preMergeRes = await fetch(`${BASE_URL}/api/projects/${projectId}?userEmail=${encodeURIComponent(editorEmail)}`);
  assert(preMergeRes.ok, "Pre-merge fetch must succeed");
  const preMergeData = await preMergeRes.json();
  const preMaster = preMergeData.project.master_project_files || [];
  const preWorking = preMergeData.project.working_files || [];

  assert(preMaster[0].content !== preWorking[0].content, "Master and Working must differ before merge");
  console.log(`✓ Before merge: Master is '${preMaster[0].content}' vs Working is '${preWorking[0].content}'`);

  // Step 4: Owner clicks "Save & Sync to Master"
  console.log("\nStep 4: Owner merges and syncs fork into Master (/api/projects/sync-master)...");
  const syncRes = await fetch(`${BASE_URL}/api/projects/sync-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: editedFiles,
      ownerEmail
    })
  });
  assert(syncRes.ok, "sync-master must succeed");
  const syncData = await syncRes.json();
  assert(syncData.status === 'SUCCESS', "sync-master status must be SUCCESS");

  // Step 5: Verify editor sees pendingFork: false and master matches working 1:1
  console.log("\nStep 5: Verifying Editor's workspace state after Owner merges fork...");
  const postMergeRes = await fetch(`${BASE_URL}/api/projects/${projectId}?userEmail=${encodeURIComponent(editorEmail)}`);
  assert(postMergeRes.ok, "Post-merge fetch must succeed");
  const postMergeData = await postMergeRes.json();
  const postMaster = postMergeData.project.master_project_files || [];
  const postWorking = postMergeData.project.working_files || [];

  console.log(`✓ Post-merge pendingFork flag: ${postMergeData.project.pendingFork}`);
  console.log(`✓ Post-merge Master file content: '${postMaster[0].content}'`);
  console.log(`✓ Post-merge Working file content: '${postWorking[0].content}'`);

  assert(postMergeData.project.pendingFork === false, "pendingFork must be false");
  assert(postMaster[0].content === postWorking[0].content, "Master and Working must be identical after merge");

  // Simulate IDE client fork calculation logic on Editor side
  const masterPathMap = new Map(postMaster.map(f => [f.filePath, f]));
  let editorCount = 0;
  postWorking.forEach(wf => {
    const mf = masterPathMap.get(wf.filePath);
    if (!mf || mf.content !== wf.content) editorCount++;
  });
  postMaster.forEach(mf => {
    if (!postWorking.some(wf => wf.filePath === mf.filePath)) editorCount++;
  });

  console.log(`✓ Editor pending fork changes count computed on Editor side: ${editorCount}`);
  assert(editorCount === 0, "Editor pending changes count must be 0 after Owner merge");

  console.log("\n==========================================================================");
  console.log("🎉 OWNER SAVE FORK -> EDITOR PENDING STATE CLEARING FULLY VERIFIED!");
  console.log("==========================================================================\n");
}

testOwnerSaveForkEditorSync().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
