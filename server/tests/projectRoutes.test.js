import test from 'node:test';
import assert from 'node:assert';

const BASE_URL = 'http://127.0.0.1:5000';

test('Security Integration Test: Unauthenticated POST /api/projects/save-and-sync must return 401/403', async () => {
  const res = await fetch(`${BASE_URL}/api/projects/save-and-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: 'quantum-router-01',
      fileId: 'f-01',
      filePath: 'src/main.rs',
      content: '// Unauthenticated payload attack attempt',
      userEmail: 'malicious@hacker.org'
    })
  });

  assert.ok(res.status === 401 || res.status === 403 || res.status === 429, `Expected security status 401, 403, or 429, but received ${res.status}`);
  const data = await res.json();
  assert.ok(data.error, 'Response body must contain security error message');
});

test('Security Integration Test: Unauthenticated POST /api/projects/resolve-patch must return 401/403', async () => {
  const res = await fetch(`${BASE_URL}/api/projects/resolve-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: 'quantum-router-01',
      patchId: 'unauthorized-patch',
      action: 'APPROVE'
    })
  });

  assert.ok(res.status === 401 || res.status === 403 || res.status === 429, `Expected security status 401, 403, or 429, but received ${res.status}`);
  const data = await res.json();
  assert.ok(data.error, 'Response body must contain security error message');
});

test('Security Integration Test: Unauthenticated POST /api/projects/:id/invite must return 401/403', async () => {
  const res = await fetch(`${BASE_URL}/api/projects/quantum-router-01/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inviteeEmail: 'victim@gmail.com',
      role: 'ADMIN'
    })
  });

  assert.ok(res.status === 401 || res.status === 403 || res.status === 429, `Expected security status 401, 403, or 429, but received ${res.status}`);
  const data = await res.json();
  assert.ok(data.error, 'Response body must contain security error message');
});
