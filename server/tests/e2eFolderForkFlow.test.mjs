/**
 * E2E regression suite — runs against a REAL hardened server.
 *
 * Covers:
 *   A. Auth enforcement negatives: tokenless / invalid-token requests rejected (401),
 *      role gates reject editors from owner-only actions (403).
 *   B. Folder/fork flow regressions (all with real Firebase ID tokens):
 *      1. Editor-deleted folder reappears / shows multiple instances
 *      2. Owner fork acceptance (Save & Sync) not applied on the first try
 *      3. Fork request notice twitches (pendingFork flag flapping)
 *
 * Requires:
 *   - serviceAccount.json in the repo root (or FIREBASE_SERVICE_ACCOUNT env),
 *   - VITE_FIREBASE_API_KEY in .env,
 *   - local server on :5000 started WITH FIREBASE_SERVICE_ACCOUNT set.
 *
 * Skips silently when any prerequisite is missing.
 * Run: node server/tests/e2eFolderForkFlow.test.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const saPath = path.join(root, 'serviceAccount.json');

if (!fs.existsSync(saPath) && !process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log('SKIP: serviceAccount.json / FIREBASE_SERVICE_ACCOUNT not present — E2E test skipped.');
  process.exit(0);
}

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || fs.readFileSync(saPath, 'utf8');
const serviceAccount = JSON.parse(saRaw);

const API_KEY = process.env.VITE_FIREBASE_API_KEY;
if (!API_KEY) {
  console.log('SKIP: VITE_FIREBASE_API_KEY missing — cannot exchange custom tokens.');
  process.exit(0);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
const adminApp = initializeApp(
  { credential: cert(serviceAccount), projectId: serviceAccount.project_id },
  'e2e-folder-fork-test'
);
const db = getFirestore(adminApp);
const auth = getAuth(adminApp);

const BASE = 'http://127.0.0.1:5000/api/projects';
const OWNER = 'qoder.e2e.owner@obsidianide-test.dev';
const EDITOR = 'qoder.e2e.editor@obsidianide-test.dev';
const OWNER_UID = 'e2e_owner_uid';
const EDITOR_UID = 'e2e_editor_uid';
const projectId = `proj_e2e_${Date.now()}`;

let passed = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  passed++;
  console.log(`  ✅ ${label}`);
};

// Mint a real Firebase ID token for a synthetic user via custom-token exchange.
const mintIdToken = async (uid, email) => {
  const customToken = await auth.createCustomToken(uid, { email });
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!data?.idToken) {
    throw new Error(`Token exchange failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data.idToken;
};

let ownerToken = '';
let editorToken = '';

const req = async (method, url, { token = '', body = null } = {}) => {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
};

const post = async (url, body, token) => {
  const r = await req('POST', url, { token, body });
  if (!r.ok) throw new Error(`POST ${url} -> HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
};

const getProject = async (token) => {
  const r = await req('GET', `${BASE}/${projectId}`, { token });
  if (!r.ok) throw new Error(`GET project -> HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data.project;
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

const cleanup = async () => {
  try {
    await req('DELETE', `${BASE}/${projectId}`, { token: ownerToken });
  } catch (e) {}
  for (const email of [OWNER, EDITOR]) {
    const docId = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    await db.collection('users').doc(docId).delete().catch(() => {});
  }
  for (const uid of [OWNER_UID, EDITOR_UID]) {
    await auth.deleteUser(uid).catch(() => {});
  }
};

try {
  // Wait for server
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      await fetch(BASE);
      up = true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 750));
    }
  }
  if (!up) throw new Error('Server on :5000 never became reachable');

  // The suite only validates the hardened (strict) server configuration.
  const probe = await req('GET', BASE);
  if (probe.status !== 401) {
    console.log('SKIP: server on :5000 is not running with FIREBASE_SERVICE_ACCOUNT (strict auth disabled).');
    await adminApp.delete();
    process.exit(0);
  }

  console.log('\n── Step 0: Mint verified sessions for OWNER and EDITOR ──');
  ownerToken = await mintIdToken(OWNER_UID, OWNER);
  editorToken = await mintIdToken(EDITOR_UID, EDITOR);
  check('minted owner + editor Firebase ID tokens', Boolean(ownerToken && editorToken));

  console.log('\n── Step 1: Auth enforcement negatives ──');
  const tokenlessList = await req('GET', BASE);
  check('tokenless GET /api/projects -> 401', tokenlessList.status === 401);
  const tokenlessCreate = await req('POST', BASE, { body: { title: 'x', ownerEmail: OWNER } });
  check('tokenless create project -> 401', tokenlessCreate.status === 401);
  const invalidToken = await req('POST', BASE, { token: 'invalid.jwt.token', body: { title: 'x', ownerEmail: OWNER } });
  check('invalid bearer token -> 401', invalidToken.status === 401);
  const tokenlessDelete = await req('DELETE', `${BASE}/${projectId}`);
  check('tokenless delete project -> 401', tokenlessDelete.status === 401);

  console.log('\n── Step 2: Owner creates project (verified) ──');
  const spoofOwner = await req('POST', BASE, {
    token: editorToken,
    body: { projectId, title: 'Spoof', ownerEmail: OWNER, languageEnv: 'PYTHON_3.11' }
  });
  check('editor cannot create a project under the owner\'s email -> 403', spoofOwner.status === 403);

  const created = await post(BASE, {
    projectId,
    title: 'E2E Fork Flow Test',
    ownerEmail: OWNER,
    languageEnv: 'PYTHON_3.11',
    collaborators: {}
  }, ownerToken);
  check('project created', created.status === 'SUCCESS');
  const baseFiles = created.project.working_files;
  check('seed file present', baseFiles.length === 1 && baseFiles[0].filePath === 'main.py');

  console.log('\n── Step 3: Owner invites editor via the verified invite endpoint ──');
  const invited = await post(`${BASE}/${projectId}/invite`, { email: EDITOR, role: 'EDITOR' }, ownerToken);
  check('invite accepted', invited.status === 'SUCCESS');
  const editorInvite = await req('POST', `${BASE}/${projectId}/invite`, {
    token: editorToken,
    body: { email: 'someone@else.dev', role: 'EDITOR' }
  });
  check('editor cannot invite others -> 403', editorInvite.status === 403);

  console.log('\n── Step 4: Editor uploads a folder (2 files under docs/) ──');
  const withFolder = [
    ...baseFiles,
    { fileId: 'e2e_f1', projectId, filePath: 'docs/readme.md', fileName: 'readme.md', content: '# readme', fileType: 'md', updatedAt: new Date().toISOString(), lastModifiedBy: EDITOR },
    { fileId: 'e2e_f2', projectId, filePath: 'docs/guide.md', fileName: 'guide.md', content: '# guide', fileType: 'md', updatedAt: new Date().toISOString(), lastModifiedBy: EDITOR }
  ];
  await post(`${BASE}/update-files`, { projectId, working_files: withFolder }, editorToken);
  let proj = await getProject(ownerToken);
  check('owner sees 3 working files', proj.working_files.length === 3);
  let sub = await listSubcollection();
  check('subcollection has 3 docs', sub.length === 3);

  const tokenlessWrite = await req('POST', `${BASE}/update-files`, {
    body: { projectId, working_files: baseFiles }
  });
  check('tokenless update-files -> 401', tokenlessWrite.status === 401);

  console.log('\n── Step 5: Editor deletes the folder (Bug 1) ──');
  await post(`${BASE}/update-files`, { projectId, working_files: baseFiles }, editorToken);
  proj = await getProject(ownerToken);
  check('deleted folder gone from working_files', pathsOf(proj.working_files).join(',') === 'main.py');
  check('no duplicate paths in working_files', unique(pathsOf(proj.working_files)).length === proj.working_files.length);
  sub = await listSubcollection();
  check('subcollection pruned to active files only', sub.length === 1 && sub[0].filePath === 'main.py');

  console.log('\n── Step 6: Editor requests fork ──');
  await post(`${BASE}/update-files`, { projectId, working_files: baseFiles, pendingFork: true }, editorToken);
  proj = await getProject(ownerToken);
  check('pendingFork is true after fork request', proj.pendingFork === true);

  console.log('\n── Step 7: Twitch simulation — stale writes must NOT flip the flag (Bug 3) ──');
  for (let i = 0; i < 3; i++) {
    await post(`${BASE}/update-files`, { projectId, working_files: baseFiles }, editorToken);
    const docNow = await readProjectDoc();
    check(`flag stable after editor write #${i + 1} without pendingFork`, docNow.pendingFork === true);
  }
  await post(`${BASE}/update-files`, { projectId, working_files: baseFiles }, ownerToken);
  let docNow = await readProjectDoc();
  check('flag stable after owner write without pendingFork', docNow.pendingFork === true);

  console.log('\n── Step 8: Duplicate-path payload is deduplicated ──');
  const dupes = [
    ...baseFiles,
    { ...baseFiles[0], fileId: 'dupe_A', updatedAt: new Date(Date.now() - 10000).toISOString() },
    { ...baseFiles[0], fileId: 'dupe_B', updatedAt: new Date().toISOString(), content: 'newest wins' }
  ];
  await post(`${BASE}/update-files`, { projectId, working_files: dupes, pendingFork: true }, editorToken);
  proj = await getProject(ownerToken);
  check('one entry per path after duplicate payload', proj.working_files.length === 1 && proj.working_files[0].filePath === 'main.py');
  check('most recent duplicate (by updatedAt) survives', proj.working_files[0].updatedAt === dupes[2].updatedAt);
  sub = await listSubcollection();
  check('no subcollection docs for absent paths', sub.length > 0 && sub.every(d => d.filePath === 'main.py'));

  console.log('\n── Step 9: Role gates on owner-only actions ──');
  const editorSync = await req('POST', `${BASE}/sync-master`, {
    token: editorToken,
    body: { projectId, working_files: baseFiles }
  });
  check('editor sync-master -> 403', editorSync.status === 403);

  console.log('\n── Step 10: Owner accepts fork via sync-master (Bug 2 — must apply first try) ──');
  const accepted = await post(`${BASE}/sync-master`, { projectId, working_files: baseFiles }, ownerToken);
  check('sync-master reports SUCCESS', accepted.status === 'SUCCESS');
  proj = await getProject(ownerToken);
  check('pendingFork cleared', proj.pendingFork === false);
  check('master == working == [main.py]', pathsOf(proj.master_project_files).join(',') === 'main.py' && pathsOf(proj.working_files).join(',') === 'main.py');
  sub = await listSubcollection();
  check('no subcollection docs for deleted paths after acceptance', sub.length > 0 && sub.every(d => d.filePath === 'main.py'));

  console.log('\n── Step 11: Resurrection check — repeated reads (poll simulation) ──');
  for (let i = 0; i < 3; i++) {
    const p = await getProject(editorToken);
    check(`poll #${i + 1}: deleted folder stays deleted`, pathsOf(p.working_files).join(',') === 'main.py' && pathsOf(p.master_project_files).join(',') === 'main.py');
  }
  docNow = await readProjectDoc();
  check('Firestore doc itself has no docs/ residue', !(docNow.working_files || []).some(f => (f.filePath || '').startsWith('docs/')));

  console.log('\n── Cleanup ──');
  const delRes = await req('DELETE', `${BASE}/${projectId}`, { token: ownerToken });
  check('project deleted by verified owner', delRes.ok && delRes.data.deleted === true);
  await db.collection('users').doc(OWNER.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_')).delete().catch(() => {});
  await db.collection('users').doc(EDITOR.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_')).delete().catch(() => {});
  const leftovers = await readProjectDoc();
  check('no leftover project doc', leftovers === null);

  console.log(`\n🎉 ALL ${passed} E2E CHECKS PASSED`);
  await auth.deleteUser(OWNER_UID).catch(() => {});
  await auth.deleteUser(EDITOR_UID).catch(() => {});
  await adminApp.delete();
  process.exit(0);
} catch (err) {
  console.error('\n❌ E2E FAILURE:', err.message);
  await cleanup();
  await adminApp.delete().catch(() => {});
  process.exit(1);
}
