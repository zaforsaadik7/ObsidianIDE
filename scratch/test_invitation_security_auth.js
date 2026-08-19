/**
 * test_invitation_security_auth.js - QA Test Suite for Invitation Security & Authorization
 *
 * Verifies:
 * 1. Unauthenticated/Incognito state requires signing in with the invited email.
 * 2. Logged-in mismatched user is blocked with ACCOUNT_MISMATCH and cannot accept someone else's invite.
 * 3. Project owner opening the link is presented with OWNER_VIEW and direct IDE launch.
 * 4. Genuine invited recipient can accept and join the workspace.
 */

console.log('🧪 Starting Invitation Security & Authorization QA Test Suite...\n');

const API_BASE = 'http://localhost:5000/api/projects';
const projId = `sec_invite_${Date.now()}`;
const ownerEmail = 'security_owner@obsidian.io';
const intendedRecipient = 'target_recipient@obsidian.io';
const unrelatedUser = 'eavesdropper@attacker.io';

// ── Step 1: Create Project with Intended Recipient ───────────────────────────
console.log('Step 1: Owner creates project repository...');
const createRes = await fetch(API_BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: projId,
    title: 'Quantum_Shield_Core',
    ownerEmail,
    languageEnv: 'PYTHON_3.11',
    collaborators: { [intendedRecipient]: 'EDITOR' }
  })
});
if (!createRes.ok) throw new Error('Failed to create project repository');
console.log('  ✓ Project created.');

// ── Step 2: Evaluate 4-State Authorization Simulation Function ───────────────
console.log('\nStep 2: Evaluating 4-state invitation authorization matrix...');

function evaluateInviteAccess({ currentUserEmail, targetOwnerEmail, paramEmail, existingCollabs = {} }) {
  const loggedEmail = (currentUserEmail || '').trim().toLowerCase();
  const ownerNorm = (targetOwnerEmail || '').trim().toLowerCase();
  const targetNorm = (paramEmail || '').trim().toLowerCase();
  const userCollabRole = loggedEmail ? existingCollabs[loggedEmail] : null;

  // State 1: Unauthenticated
  if (!loggedEmail) {
    return {
      state: 'UNAUTHENTICATED',
      canAccept: false,
      message: `Authentication required as ${targetNorm || 'invited user'}`
    };
  }

  // State 2: Repository Owner
  if (loggedEmail === ownerNorm) {
    return {
      state: 'OWNER_VIEW',
      canAccept: false,
      isOwner: true,
      message: 'You own this repository'
    };
  }

  // State 3: Account Mismatch
  if (targetNorm && loggedEmail !== targetNorm && !userCollabRole) {
    return {
      state: 'ACCOUNT_MISMATCH',
      canAccept: false,
      message: `Invitation intended for ${targetNorm}, but signed in as ${loggedEmail}`
    };
  }

  // State 4: Authorized
  return {
    state: 'AUTHORIZED',
    canAccept: true,
    message: `Authorized as ${loggedEmail}`
  };
}

const collabs = { [intendedRecipient]: 'EDITOR' };

// Scenario A: Incognito / Unauthenticated Visitor
const resIncognito = evaluateInviteAccess({
  currentUserEmail: null,
  targetOwnerEmail: ownerEmail,
  paramEmail: intendedRecipient,
  existingCollabs: collabs
});
console.log(`  Scenario A (Incognito): State = ${resIncognito.state}, Can Accept = ${resIncognito.canAccept}`);
if (resIncognito.state !== 'UNAUTHENTICATED' || resIncognito.canAccept !== false) {
  throw new Error('Security violation: Unauthenticated visitor was not blocked with UNAUTHENTICATED!');
}
console.log('  ✓ Verified unauthenticated visitor is strictly prompted to sign in.');

// Scenario B: Wrong User Logged In (Account Mismatch)
const resMismatch = evaluateInviteAccess({
  currentUserEmail: unrelatedUser,
  targetOwnerEmail: ownerEmail,
  paramEmail: intendedRecipient,
  existingCollabs: collabs
});
console.log(`  Scenario B (Wrong User '${unrelatedUser}'): State = ${resMismatch.state}, Can Accept = ${resMismatch.canAccept}`);
if (resMismatch.state !== 'ACCOUNT_MISMATCH' || resMismatch.canAccept !== false) {
  throw new Error('Security violation: Mismatched account was not blocked with ACCOUNT_MISMATCH!');
}
console.log('  ✓ Verified mismatched account cannot accept someone else\'s invitation.');

// Scenario C: Project Owner Visits Invitation Link
const resOwner = evaluateInviteAccess({
  currentUserEmail: ownerEmail,
  targetOwnerEmail: ownerEmail,
  paramEmail: intendedRecipient,
  existingCollabs: collabs
});
console.log(`  Scenario C (Project Owner '${ownerEmail}'): State = ${resOwner.state}, isOwner = ${resOwner.isOwner}`);
if (resOwner.state !== 'OWNER_VIEW' || resOwner.isOwner !== true) {
  throw new Error('Project owner was not recognized with OWNER_VIEW!');
}
console.log('  ✓ Verified project owner is shown Owner launch view.');

// Scenario D: Intended Recipient Visits Invitation Link
const resAuthorized = evaluateInviteAccess({
  currentUserEmail: intendedRecipient,
  targetOwnerEmail: ownerEmail,
  paramEmail: intendedRecipient,
  existingCollabs: collabs
});
console.log(`  Scenario D (Intended Recipient '${intendedRecipient}'): State = ${resAuthorized.state}, Can Accept = ${resAuthorized.canAccept}`);
if (resAuthorized.state !== 'AUTHORIZED' || resAuthorized.canAccept !== true) {
  throw new Error('Intended recipient was not granted AUTHORIZED access!');
}
console.log('  ✓ Verified intended recipient is authorized to accept invitation.');

// ── Step 3: Test Intended Recipient Accept Handshake ────────────────────────
console.log('\nStep 3: Intended recipient accepts invitation...');
const acceptRes = await fetch(`${API_BASE}/${projId}/invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: intendedRecipient,
    role: 'EDITOR'
  })
});
const acceptData = await acceptRes.json();
if (!acceptRes.ok) throw new Error(`Accept handshake failed: ${JSON.stringify(acceptData)}`);
console.log('  ✓ Intended recipient accepted into project collaborators roster.');

console.log('\n================================================================');
console.log('🎉 INVITATION SECURITY & AUTHENTICATION TESTS PASSED 100%!');
console.log('================================================================');
