/**
 * test_duplicate_project_resolution.js - QA Test Suite for Project Card Unicity
 * Verifies that when a collaborator accepts an invitation, exactly 1 project instance appears.
 */

const API_BASE = 'http://localhost:5000/api/projects';

console.log('🧪 Starting Project Card Unicity & Duplicate Elimination QA Test Suite...\n');

const testOwner = 'lead_architect@obsidian.io';
const testCollab = 'junior_dev@obsidian.io';
const baseTitle = 'Hyper_Mesh_Network';

// ── Test 1: Create Project via Backend API ─────────────────────────────────
console.log('Test 1: Creating project repository...');
const projIdA = `proj_hyper_mesh_${Date.now()}`;

const createRes = await fetch(API_BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: projIdA,
    title: baseTitle,
    ownerEmail: testOwner,
    languageEnv: 'RUST_1.75',
    collaborators: { [testCollab]: 'EDITOR' }
  })
});
const createData = await createRes.json();
if (!createRes.ok) throw new Error(`Project creation failed: ${JSON.stringify(createData)}`);
console.log(`  ✓ Project created with ID: ${projIdA}`);

// ── Test 2: Collaborator Accepts Invite via Invite Endpoint ─────────────────
console.log('\nTest 2: Collaborator accepts invite...');
const inviteRes = await fetch(`${API_BASE}/${projIdA}/invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: testCollab,
    role: 'EDITOR'
  })
});
const inviteData = await inviteRes.json();
if (!inviteRes.ok) throw new Error(`Invite accept failed: ${JSON.stringify(inviteData)}`);
console.log('  ✓ Invite accepted successfully.');

// ── Test 3: Query Collaborator Dashboard Projects ───────────────────────────
console.log('\nTest 3: Querying collaborator dashboard projects list...');
const listRes = await fetch(`${API_BASE}?email=${encodeURIComponent(testCollab)}`);
const listData = await listRes.json();
const projects = listData.projects || [];

console.log(`  Total project instances returned: ${projects.length}`);

// Filter projects for our test title
const matching = projects.filter(p => (p.title || '').toLowerCase() === baseTitle.toLowerCase());
console.log(`  Instances of '${baseTitle}': ${matching.length}`);

if (matching.length !== 1) {
  console.error('Matching projects found:', matching);
  throw new Error(`Expected exactly 1 instance of '${baseTitle}', but found ${matching.length}!`);
}

const card = matching[0];
console.log(`  Card Title: '${card.title}'`);
console.log(`  Card Role: '${card.userRole}' (Expected: 'EDITOR')`);
console.log(`  Card Owner: '${card.ownerEmail}'`);

if (card.userRole !== 'EDITOR') {
  throw new Error(`Expected role 'EDITOR', but got '${card.userRole}'!`);
}

console.log('\n================================================================');
console.log('🎉 PROJECT CARD UNICITY & DEDUPLICATION TEST PASSED 100%!');
console.log('================================================================');
