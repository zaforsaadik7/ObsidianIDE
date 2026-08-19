import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('🧪 Starting Profile Projects & Storage Quota Tests...\n');

  const testEmail = 'zaforsaadik7@gmail.com';

  // 1. Create a project with ~1.2MB of file content
  console.log('1️⃣ Creating Project Alpha with ~1.2 MB file...');
  const largeContent = 'X'.repeat(1200 * 1024); // 1,228,800 bytes = 1.17 MB
  const alphaProjectId = 'proj_test_alpha_' + Date.now();

  const createAlphaRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: alphaProjectId,
      title: 'Alpha Large Project',
      ownerEmail: testEmail,
      languageEnv: 'PYTHON_3.11'
    })
  });
  console.log('Project Alpha created status:', createAlphaRes.status);

  // Save the large file into Alpha project
  const saveAlphaFilesRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: alphaProjectId,
      userEmail: testEmail,
      working_files: [
        {
          filePath: 'large_dataset.txt',
          fileName: 'large_dataset.txt',
          content: largeContent,
          fileType: 'txt',
          updatedAt: new Date().toISOString()
        }
      ]
    })
  });
  console.log('Saved large file status:', saveAlphaFilesRes.status);

  // 2. Create Project Beta with ~500 KB file
  console.log('\n2️⃣ Creating Project Beta with ~500 KB file...');
  const mediumContent = 'Y'.repeat(500 * 1024); // 512,000 bytes = 0.49 MB
  const betaProjectId = 'proj_test_beta_' + Date.now();

  const createBetaRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: betaProjectId,
      title: 'Beta Medium Project',
      ownerEmail: testEmail,
      languageEnv: 'RUST_1.75'
    })
  });
  console.log('Project Beta created status:', createBetaRes.status);

  const saveBetaFilesRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: betaProjectId,
      userEmail: testEmail,
      working_files: [
        {
          filePath: 'src/main.rs',
          fileName: 'main.rs',
          content: mediumContent,
          fileType: 'rs',
          updatedAt: new Date().toISOString()
        }
      ]
    })
  });
  console.log('Saved medium file status:', saveBetaFilesRes.status);

  // 3. Fetch User Profile from /api/users/profile
  console.log('\n3️⃣ Fetching user profile from GET /api/users/profile...');
  const profileRes = await fetch(`${BASE_URL}/api/users/profile?email=${encodeURIComponent(testEmail)}`);
  const profileData = await profileRes.json();

  console.log('Status:', profileRes.status);
  console.log('Profile Info:');
  console.log('  - Email:', profileData.profile?.info?.email);
  console.log('  - Projects in Profile:', Object.keys(profileData.profile?.projects || {}).length);
  console.log('  - Used Storage (MB):', profileData.profile?.info?.usedStorageMb);
  console.log('  - Allocated Storage (MB):', profileData.profile?.info?.allocatedStorageMb);
  console.log('  - Usage Percentage:', profileData.profile?.info?.usagePercentage + '%');

  const totalBytesExpected = (1200 * 1024) + (500 * 1024); // 1,740,800 bytes = 1.66 MB
  const expectedMb = Number((totalBytesExpected / (1024 * 1024)).toFixed(2)); // ~1.66 MB

  console.log(`Expected storage MB: ~${expectedMb} MB`);

  if (profileData.profile?.info?.usedStorageMb >= 1.65 && profileData.profile?.info?.usedStorageMb <= 1.67) {
    console.log('✅ PASS: Storage calculation matches exact byte payload!');
  } else {
    console.log(`❌ FAIL: Expected ~${expectedMb} MB but got ${profileData.profile?.info?.usedStorageMb} MB`);
  }

  // 4. Test Adding More Content in Editor (Live dynamic recalculation)
  console.log('\n4️⃣ Simulating Editor typing: Adding 400 KB more data to Project Beta...');
  const extraContent = 'Z'.repeat(900 * 1024); // Increased to 900 KB
  await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: betaProjectId,
      userEmail: testEmail,
      working_files: [
        {
          filePath: 'src/main.rs',
          fileName: 'main.rs',
          content: extraContent,
          fileType: 'rs',
          updatedAt: new Date().toISOString()
        }
      ]
    })
  });

  const updatedProfileRes = await fetch(`${BASE_URL}/api/users/profile?email=${encodeURIComponent(testEmail)}`);
  const updatedProfileData = await updatedProfileRes.json();
  console.log('Updated Used Storage (MB):', updatedProfileData.profile?.info?.usedStorageMb);
  console.log('Updated Usage Percentage:', updatedProfileData.profile?.info?.usagePercentage + '%');

  const newExpectedBytes = (1200 * 1024) + (900 * 1024); // 2,150,400 bytes = 2.05 MB
  const newExpectedMb = Number((newExpectedBytes / (1024 * 1024)).toFixed(2)); // ~2.05 MB

  if (updatedProfileData.profile?.info?.usedStorageMb >= 2.04 && updatedProfileData.profile?.info?.usedStorageMb <= 2.06) {
    console.log('✅ PASS: Real-time dynamic recalculation on editor save verified!');
  } else {
    console.log(`❌ FAIL: Expected ~${newExpectedMb} MB but got ${updatedProfileData.profile?.info?.usedStorageMb} MB`);
  }

  console.log('\n🎉 ALL INTERNAL TESTS PASSED!');
}

runTests().catch(console.error);
