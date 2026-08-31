/**
 * E2E regression test for the three production bugs:
 *   1. Editor-deleted folder reappears / shows multiple instances
 *   2. Owner fork acceptance (Save & Sync) not applied on the first try
 *   3. Fork request notice twitches (pendingFork flag flapping)
 *
 * Requires: local server on :5000 started WITH FIREBASE_SERVICE_ACCOUNT set,
 * and serviceAccount.json in the repo root. Skips silently if missing.
 *
 * Run: node server/tests/e2eFolderForkFlow.test.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const saPath = path.join(root, 'serviceAccount.json');

if (!fs.existsSync(saPath)) {
  console.log('SKIP: serviceAccount.json not present — E2E Firestore test skipped.');
  process.exit(0);
}

const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(saPath, 'utf8');

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const adminApp = initializeApp(
  { credential: cert(serviceAccount), projectId: serviceAccount.project_id },
  'e2e-folder-fork-test'
);
const db = getFirestore(adminApp);

const BASE = 'http://127.0.0.1:5000/api/projects';
const OWNER = 'qoder.e2e.owner@obsidianide-test.dev';
const EDITOR = 'qoder.e2e.editor@obsidianide-test.dev';
const projectId = `proj_e2e_${Date.now()}`;

let passed = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  passed++;
  console.log(`  ✅ ${label}`);
};

const post = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${url} -> HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
};

const getProject = async (asEmail) => {
  const res = await fetch(`${BASE}/${projectId}?userEmail=${encodeURIComponent(asEmail)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET project -> HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data.project;
};

const listSubcollection = async () => {
  const snap = await db.collection('projects').doc(projectId).collection('files').get();
  return snap.docs.map(d => ({ docId: d.id, ...d.data() }));
};

const readProjectDoc = async () => {
  const snap = await db.collection('projects').doc(projectId).get();
  return snap.exists ? snap.data() : null;
};

const pathsOf = (files) => (files || []).map(f => f.filePath).sort();
const unique = (arr) => [...new Set(arr)];

try {
  // Wait for server
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      await fetch(`${BASE}/${projectId}?userEmail=${encodeURIComponent(OWNER)}`);
      up = true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 750));
    }
  }
  if (!up) throw new Error('Server on :5000 never became reachable');

  console.log('\n── Step 1: Owner creates project ──');
  const created = await post(BASE, {
    projectId,
    title: 'E2E Fork Flow Test',
    ownerEmail: OWNER,
    languageEnv: 'PYTHON_3.11',
    collaborators: {}
  });
  check('project created', created.status === 'SUCCESS');
  const baseFiles = created.project.working_files;
  check('seed file present', baseFiles.length === 1 && baseFiles[0].filePath === 'main.py');
  // Grant the simulated editor access (project created without collaborators to
  // avoid dispatching real invitation emails) — same shape POST / uses
  await db.collection('projects').doc(projectId).set({
    collaborators: { [OWNER]: 'OWNER', [EDITOR]: 'EDITOR' }
  }, { merge: true });

  console.log('\n── Step 2: Editor uploads a folder (2 files under docs/) ──');
  const withFolder = [
    ...baseFiles,
    { fileId: 'e2e_f1', projectId, filePath: 'docs/readme.md', fileName: 'readme.md', content: '# readme', fileType: 'md', updatedAt: new Date().toISOString(), lastModifiedBy: EDITOR },
    { fileId: 'e2e_f2', projectId, filePath: 'docs/guide.md', fileName: 'guide.md', content: '# guide', fileType: 'md', updatedAt: new Date().toISOString(), lastModifiedBy: EDITOR }
  ];
  await post(`${BASE}/update-files`, { projectId, working_files: withFolder, userEmail: EDITOR, isOwner: false });
  let proj = await getProject(OWNER);
  check('owner sees 3 working files', proj.working_files.length === 3);
  let sub = await listSubcollection();
  check('subcollection has 3 docs', sub.length === 3);

  console.log('\n── Step 3: Editor deletes the folder (Bug 1) ──');
  await post(`${BASE}/update-files`, { projectId, working_files: baseFiles, userEmail: EDITOR, isOwner: false });
  proj = await getProject(OWNER);
  check('deleted folder gone from working_files', pathsOf(proj.working_files).join(',') === 'main.py');
  check('no duplicate paths in working_files', unique(pathsOf(proj.working_files)).length === proj.working_files.length);
  sub = await listSubcollection();
  check('subcollection pruned to active files only', sub.length === 1 && sub[0].filePath === 'main.py');

  console.log('\n── Step 4: Editor requests fork ──');
  await post(`${BASE}/update-files`, { projectId, working_files: baseFiles, userEmail: EDITOR, isOwner: false, pendingFork: true });
  proj = await getProject(OWNER);
  check('pendingFork is true after fork request', proj.pendingFork === true);

  console.log('\n── Step 5: Twitch simulation — stale writes must NOT flip the flag (Bug 3) ──');
  for (let i = 0; i < 3; i++) {
    await post(`${BASE}/update-files`, { projectId, working_files: baseFiles, userEmail: EDITOR, isOwner: false });
    const docNow = await readProjectDoc();
    check(`flag stable after editor write #${i + 1} without pendingFork`, docNow.pendingFork === true);
  }
  await post(`${BASE}/update-files`, { projectId, working_files: baseFiles, userEmail: OWNER, isOwner: true });
  let docNow = await readProjectDoc();
  check('flag stable after owner write without pendingFork', docNow.pendingFork === true);

  console.log('\n── Step 6: Duplicate-path payload is deduplicated ──');
  const dupes = [
    ...baseFiles,
    { ...baseFiles[0], fileId: 'dupe_A', updatedAt: new Date(Date.now() - 10000).toISOString() },
    { ...baseFiles[0], fileId: 'dupe_B', updatedAt: new Date().toISOString(), content: 'newest wins' }
  ];
  await post(`${BASE}/update-files`, { projectId, working_files: dupes, userEmail: EDITOR, isOwner: false, pendingFork: true });
  proj = await getProject(OWNER);
  check('one entry per path after duplicate payload', proj.working_files.length === 1 && proj.working_files[0].filePath === 'main.py');
  check('most recent duplicate (by updatedAt) survives', proj.working_files[0].updatedAt === dupes[2].updatedAt);
  sub = await listSubcollection();
  check('no subcollection docs for absent paths', sub.length > 0 && sub.every(d => d.filePath === 'main.py'));

  console.log('\n── Step 7: Owner accepts fork via sync-master (Bug 2 — must apply first try) ──');
  const accepted = await post(`${BASE}/sync-master`, { projectId, working_files: baseFiles, ownerEmail: OWNER });
  check('sync-master reports SUCCESS', accepted.status === 'SUCCESS');
  proj = await getProject(OWNER);
  check('pendingFork cleared', proj.pendingFork === false);
  check('master == working == [main.py]', pathsOf(proj.master_project_files).join(',') === 'main.py' && pathsOf(proj.working_files).join(',') === 'main.py');
  sub = await listSubcollection();
  check('no subcollection docs for deleted paths after acceptance', sub.length > 0 && sub.every(d => d.filePath === 'main.py'));

  console.log('\n── Step 8: Resurrection check — repeated reads (poll simulation) ──');
  for (let i = 0; i < 3; i++) {
    const p = await getProject(EDITOR);
    check(`poll #${i + 1}: deleted folder stays deleted`, pathsOf(p.working_files).join(',') === 'main.py' && pathsOf(p.master_project_files).join(',') === 'main.py');
  }
  docNow = await readProjectDoc();
  check('Firestore doc itself has no docs/ residue', !(docNow.working_files || []).some(f => (f.filePath || '').startsWith('docs/')));

  console.log('\n── Cleanup ──');
  const delRes = await fetch(`${BASE}/${projectId}?userEmail=${encodeURIComponent(OWNER)}`, { method: 'DELETE' });
  const delData = await delRes.json().catch(() => ({}));
  check('project deleted', delRes.ok && delData.deleted === true);
  const ownerDocId = OWNER.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
  await db.collection('users').doc(ownerDocId).delete().catch(() => {});
  const leftovers = await readProjectDoc();
  check('no leftover project doc', leftovers === null);

  console.log(`\n🎉 ALL ${passed} E2E CHECKS PASSED`);
  await adminApp.delete();
  process.exit(0);
} catch (err) {
  console.error('\n❌ E2E FAILURE:', err.message);
  try {
    await fetch(`${BASE}/${projectId}?userEmail=${encodeURIComponent(OWNER)}`, { method: 'DELETE' }).catch(() => {});
    const ownerDocId = OWNER.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    await db.collection('users').doc(ownerDocId).delete().catch(() => {});
  } catch (e) {}
  await adminApp.delete().catch(() => {});
  process.exit(1);
}
