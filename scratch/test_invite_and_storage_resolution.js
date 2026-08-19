import assert from 'assert';

const BASE_URL = 'http://localhost:5000';

async function testCollaboratorInviteAndStorage() {
  console.log("================================================================================");
  console.log("  TEST: COLLABORATOR INVITATION & DATABASE ACCESS CONTINUITY");
  console.log("================================================================================\n");

  const testEmail = `collab_${Date.now()}@obsidian.io`;
  const projectId = `proj_test_${Date.now()}`;

  // 1. Register Collaborator User Account
  console.log("▶ [STEP 1]: Registering new collaborator account...");
  const regRes = await fetch(`${BASE_URL}/api/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      displayName: 'Invited Collaborator',
      profession: 'Software Engineer'
    })
  });

  const regData = await regRes.json();
  assert.strictEqual(regRes.status, 201);
  assert.strictEqual(regData.profile.info.personalStorageConnected, true);
  console.log("  ✓ Collaborator account created with personalStorageConnected = true.");

  // 2. Fetch Collaborator Profile
  console.log("\n▶ [STEP 2]: Fetching collaborator user profile...");
  const profRes = await fetch(`${BASE_URL}/api/users/profile?email=${encodeURIComponent(testEmail)}`);
  const profData = await profRes.json();
  assert.strictEqual(profRes.status, 200);
  assert.strictEqual(profData.profile.info.personalStorageConnected, true);
  console.log("  ✓ Profile retrieved. personalStorageConnected is TRUE (no onboarding redirect).");

  // 3. Project Owner Invites Collaborator
  console.log("\n▶ [STEP 3]: Project Owner sends project invitation...");
  const inviteRes = await fetch(`${BASE_URL}/api/projects/${projectId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      role: 'EDITOR'
    })
  });
  const inviteData = await inviteRes.json();
  assert.strictEqual(inviteRes.status, 200);
  console.log("  ✓ Collaborator successfully added to project roster.");

  console.log("\n================================================================================");
  console.log("  ✓ ALL INVITATION & DATABASE CONTINUITY CHECKS PASSED!");
  console.log("================================================================================");
}

testCollaboratorInviteAndStorage().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
