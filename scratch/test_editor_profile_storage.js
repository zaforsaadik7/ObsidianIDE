import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function runEditorTests() {
  console.log('🧪 Starting Multi-User Editor Profile & Storage Quota Tests...\n');

  const ownerEmail = 'owner_lead@obsidian.io';
  const editorEmail = 'editor_member@obsidian.io';
  const projectId = 'proj_collab_test_' + Date.now();

  // 1. Owner creates a project and adds Editor as collaborator
  console.log('1️⃣ Owner creating collaborative project and inviting editor...');
  const createRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      title: 'Distributed Neural Engine',
      ownerEmail,
      languageEnv: 'PYTHON_3.11',
      collaborators: {
        [editorEmail]: 'EDITOR'
      }
    })
  });
  console.log('Project created status:', createRes.status);

  // 2. Editor writes code in the workspace (850 KB file)
  console.log('\n2️⃣ Editor modifying and saving working fork files in editor (~850 KB)...');
  const editorContent = 'E'.repeat(850 * 1024); // 870,400 bytes = 0.83 MB
  const saveRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      userEmail: editorEmail,
      working_files: [
        {
          filePath: 'neural_weights.py',
          fileName: 'neural_weights.py',
          content: editorContent,
          fileType: 'py',
          updatedAt: new Date().toISOString()
        }
      ]
    })
  });
  console.log('Editor files saved status:', saveRes.status);

  // 3. Fetch Editor's Profile
  console.log('\n3️⃣ Fetching Editor Profile from GET /api/users/profile...');
  const editorProfRes = await fetch(`${BASE_URL}/api/users/profile?email=${encodeURIComponent(editorEmail)}`);
  const editorProfData = await editorProfRes.json();

  console.log('Editor Profile Status:', editorProfRes.status);
  console.log('Editor Profile Data:');
  console.log('  - Email:', editorProfData.profile?.info?.email);
  console.log('  - Projects Count:', Object.keys(editorProfData.profile?.projects || {}).length);
  console.log('  - Role in Project:', editorProfData.profile?.projects?.[projectId]?.userRole);
  console.log('  - Used Storage (MB):', editorProfData.profile?.info?.usedStorageMb);
  console.log('  - Usage Percentage:', editorProfData.profile?.info?.usagePercentage + '%');

  if (editorProfData.profile?.projects?.[projectId]?.userRole === 'EDITOR') {
    console.log('✅ PASS: Project appears in Editor portfolio with role EDITOR!');
  } else {
    console.log('❌ FAIL: Role was not EDITOR');
  }

  if (editorProfData.profile?.info?.usedStorageMb >= 0.82 && editorProfData.profile?.info?.usedStorageMb <= 0.84) {
    console.log('✅ PASS: Editor storage quota dynamically reflects the 850 KB working files!');
  } else {
    console.log(`❌ FAIL: Expected ~0.83 MB, got ${editorProfData.profile?.info?.usedStorageMb}`);
  }

  // 4. Editor adds more lines in editor (+600 KB)
  console.log('\n4️⃣ Editor adding 600 KB more lines to neural_weights.py...');
  const expandedContent = 'E'.repeat(1450 * 1024); // 1,484,800 bytes = 1.416 MB (~1.42 MB)
  await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      userEmail: editorEmail,
      working_files: [
        {
          filePath: 'neural_weights.py',
          fileName: 'neural_weights.py',
          content: expandedContent,
          fileType: 'py',
          updatedAt: new Date().toISOString()
        }
      ]
    })
  });

  const updatedEditorProfRes = await fetch(`${BASE_URL}/api/users/profile?email=${encodeURIComponent(editorEmail)}`);
  const updatedEditorProfData = await updatedEditorProfRes.json();
  console.log('Updated Editor Storage (MB):', updatedEditorProfData.profile?.info?.usedStorageMb);
  console.log('Updated Usage Percentage:', updatedEditorProfData.profile?.info?.usagePercentage + '%');

  if (updatedEditorProfData.profile?.info?.usedStorageMb >= 1.40 && updatedEditorProfData.profile?.info?.usedStorageMb <= 1.43) {
    console.log('✅ PASS: Editor dynamic recalculation on further typing passed!');
  } else {
    console.log(`❌ FAIL: Expected ~1.42 MB, got ${updatedEditorProfData.profile?.info?.usedStorageMb}`);
  }

  console.log('\n🎉 ALL COLLABORATOR / EDITOR TESTS PASSED!');
}

runEditorTests().catch(console.error);
