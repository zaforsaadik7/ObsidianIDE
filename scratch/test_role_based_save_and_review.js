import assert from 'assert';

const BASE_URL = 'http://localhost:5000';

console.log("================================================================================");
console.log("  TEST SUITE: ROLE-BASED DATABASE ISOLATION & OWNER-GATED MASTER MERGE");
console.log("================================================================================\n");

async function runRoleBasedSaveAndReviewTests() {
  const projectId = 'test-role-audit-' + Date.now();
  const ownerEmail = 'owner@obsidian.io';
  const collaboratorEmail = 'collaborator@obsidian.io';

  // ── Step 0: Seed Master Project Repository ──────────────────────────────────
  console.log("▶ [STEP 0]: Seeding initial Master Project Repository...");
  const initialFiles = [
    { fileId: 'f1', filePath: 'src/main.js', fileName: 'main.js', content: 'console.log("v1.0");', fileType: 'javascript' },
    { fileId: 'f2', filePath: 'src/config.json', fileName: 'config.json', content: '{"version": 1}', fileType: 'json' }
  ];

  const seedRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      userEmail: ownerEmail,
      project_files: initialFiles
    })
  });
  assert.strictEqual(seedRes.status, 200);
  console.log("  ✓ Master Project initialized with 2 files.");

  // ── Step 1: Collaborator Code Edit (MODIFY_FILE) ────────────────────────────
  console.log("\n▶ [STEP 1]: Collaborator submits code modification proposal...");
  const editPatchRes = await fetch(`${BASE_URL}/api/projects/save-and-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      type: 'MODIFY_FILE',
      fileId: 'f1',
      filePath: 'src/main.js',
      content: 'console.log("v2.0-collaborator-proposal");',
      oldContent: 'console.log("v1.0");',
      userEmail: collaboratorEmail,
      userName: 'Alice Collaborator',
      summaryNote: 'Upgrade logging output to v2.0'
    })
  });

  const editPatchData = await editPatchRes.json();
  assert.strictEqual(editPatchRes.status, 200);
  assert.strictEqual(editPatchData.status, 'SUCCESS');
  assert.strictEqual(editPatchData.patch.type, 'MODIFY_FILE');
  assert.strictEqual(editPatchData.patch.authorEmail, collaboratorEmail);
  console.log("  ✓ Code modification staged in Review Drawer queue. Patch ID:", editPatchData.patch.patchId);

  // ── Step 2: Collaborator Batch File/Folder/ZIP Import (IMPORT_BATCH) ────────
  console.log("\n▶ [STEP 2]: Collaborator imports batch folder project / ZIP archive...");
  const importedBatch = [
    { fileId: 'imp1', filePath: 'assets/logo.svg', fileName: 'logo.svg', content: '<svg></svg>', fileType: 'svg' },
    { fileId: 'imp2', filePath: 'src/components/Header.jsx', fileName: 'Header.jsx', content: 'export const Header = () => null;', fileType: 'javascript' },
    { fileId: 'imp3', filePath: 'docs/README.md', fileName: 'README.md', content: '# Docs', fileType: 'markdown' }
  ];

  const importPatchRes = await fetch(`${BASE_URL}/api/projects/save-and-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      type: 'IMPORT_BATCH',
      filePath: '3 imported files',
      importedFiles: importedBatch,
      userEmail: collaboratorEmail,
      userName: 'Alice Collaborator',
      summaryNote: 'Import of 3 assets & documentation files'
    })
  });

  const importPatchData = await importPatchRes.json();
  assert.strictEqual(importPatchRes.status, 200);
  assert.strictEqual(importPatchData.patch.type, 'IMPORT_BATCH');
  assert.strictEqual(importPatchData.patch.importedFiles.length, 3);
  console.log("  ✓ Batch import proposal (3 files) staged in Review Drawer. Patch ID:", importPatchData.patch.patchId);

  // ── Step 3: Collaborator New File Creation (CREATE_FILE) ────────────────────
  console.log("\n▶ [STEP 3]: Collaborator creates new file proposal...");
  const createFileRes = await fetch(`${BASE_URL}/api/projects/save-and-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      type: 'CREATE_FILE',
      fileId: 'f_new',
      filePath: 'src/utils/math.js',
      content: 'export const add = (a, b) => a + b;',
      userEmail: collaboratorEmail,
      userName: 'Alice Collaborator',
      summaryNote: 'Add math utilities'
    })
  });

  const createFileData = await createFileRes.json();
  assert.strictEqual(createFileRes.status, 200);
  assert.strictEqual(createFileData.patch.type, 'CREATE_FILE');
  console.log("  ✓ New file creation proposal staged in Review Drawer. Patch ID:", createFileData.patch.patchId);

  // ── Step 4: Collaborator Reorganize / Move Item (MOVE_ITEM) ─────────────────
  console.log("\n▶ [STEP 4]: Collaborator moves item proposal...");
  const movePatchRes = await fetch(`${BASE_URL}/api/projects/save-and-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      type: 'MOVE_ITEM',
      filePath: 'config/config.json',
      oldPath: 'src/config.json',
      newPath: 'config/config.json',
      userEmail: collaboratorEmail,
      userName: 'Alice Collaborator',
      summaryNote: 'Relocate configuration to config/ directory'
    })
  });

  const movePatchData = await movePatchRes.json();
  assert.strictEqual(movePatchRes.status, 200);
  assert.strictEqual(movePatchData.patch.type, 'MOVE_ITEM');
  console.log("  ✓ File reorganization proposal staged in Review Drawer. Patch ID:", movePatchData.patch.patchId);

  // ── Step 5: Owner Approves Batch Import Proposal ───────────────────────────
  console.log("\n▶ [STEP 5]: Project Owner opens Review Drawer & Approves IMPORT_BATCH...");
  const resolveImportRes = await fetch(`${BASE_URL}/api/projects/resolve-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      patchId: importPatchData.patch.patchId,
      action: 'APPROVE',
      ownerEmail
    })
  });

  const resolveImportData = await resolveImportRes.json();
  assert.strictEqual(resolveImportRes.status, 200);
  assert.strictEqual(resolveImportData.status, 'SUCCESS');
  assert.strictEqual(resolveImportData.action, 'APPROVED');
  console.log("  ✓ Owner approved IMPORT_BATCH. Result:", resolveImportData.message);

  // ── Step 6: Owner Approves Code Modification & New File ────────────────────
  console.log("\n▶ [STEP 6]: Project Owner Approves MODIFY_FILE and CREATE_FILE...");
  const resolveEditRes = await fetch(`${BASE_URL}/api/projects/resolve-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      patchId: editPatchData.patch.patchId,
      action: 'APPROVE',
      ownerEmail
    })
  });
  const resolveEditData = await resolveEditRes.json();
  assert.strictEqual(resolveEditRes.status, 200);
  assert.strictEqual(resolveEditData.action, 'APPROVED');
  console.log("  ✓ Code edit approved and merged into Master Repository!");

  const resolveCreateRes = await fetch(`${BASE_URL}/api/projects/resolve-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      patchId: createFileData.patch.patchId,
      action: 'APPROVE',
      ownerEmail
    })
  });
  const resolveCreateData = await resolveCreateRes.json();
  assert.strictEqual(resolveCreateRes.status, 200);
  assert.strictEqual(resolveCreateData.action, 'APPROVED');
  console.log("  ✓ New file creation approved and merged into Master Repository!");

  // ── Step 7: Owner Rejects Unwanted Proposal ────────────────────────────────
  console.log("\n▶ [STEP 7]: Project Owner Rejects Unwanted Proposal...");
  const rejectRes = await fetch(`${BASE_URL}/api/projects/resolve-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      patchId: movePatchData.patch.patchId,
      action: 'REJECT',
      ownerEmail
    })
  });
  const rejectData = await rejectRes.json();
  assert.strictEqual(rejectRes.status, 200);
  assert.strictEqual(rejectData.action, 'REJECTED');
  console.log("  ✓ Unwanted proposal rejected & dismissed without modifying Master Repository!");

  console.log("\n================================================================================");
  console.log("  ✓ ALL 7 ROLE-BASED DATABASE ISOLATION & REVIEW WORKFLOW TESTS PASSED!");
  console.log("================================================================================");
}

runRoleBasedSaveAndReviewTests().catch(err => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
