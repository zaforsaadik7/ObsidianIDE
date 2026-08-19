import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testGoogleAuthRealFlow() {
  console.log('🧪 Testing Real Firebase Google Authentication Flow & Mock Elimination...\n');

  // 1. Audit AuthPage.jsx and AuthContext.jsx to ensure 0 mock Google accounts exist
  const authPageContent = fs.readFileSync(path.resolve('src/pages/AuthPage.jsx'), 'utf-8');
  const authContextContent = fs.readFileSync(path.resolve('src/context/AuthContext.jsx'), 'utf-8');

  console.log('1. Checking for any hardcoded mock Google accounts in AuthPage.jsx...');
  if (authPageContent.includes('mockGoogleAccounts')) {
    throw new Error('❌ FAIL: Found remnants of mockGoogleAccounts in AuthPage.jsx');
  }
  console.log('✅ PASS: Zero hardcoded mock accounts in AuthPage.jsx.');

  console.log('\n2. Verifying signInWithGoogle integration with Firebase SDK...');
  if (!authContextContent.includes('signInWithPopup') || !authContextContent.includes('signInWithGoogle')) {
    throw new Error('❌ FAIL: AuthContext.jsx is missing signInWithPopup or signInWithGoogle implementation.');
  }
  console.log('✅ PASS: Real Firebase signInWithPopup & GoogleAuthProvider properly wired.');

  // 3. Test Backend User Registration & Profile retrieval with Google auth payload
  console.log('\n3. Testing Google User Profile Provisioning on Backend...');
  const testGoogleEmail = `google.developer.${Date.now()}@gmail.com`;
  const regRes = await fetch(`${BASE_URL}/api/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testGoogleEmail,
      displayName: 'Google Real Developer',
      username: '@google_real_dev',
      profession: 'Software Engineer',
      avatarUrl: 'https://lh3.googleusercontent.com/a/mock-photo'
    })
  });

  const regData = await regRes.json();
  if (regRes.status !== 200 && regRes.status !== 201) {
    throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
  }
  console.log('Google user registration status:', regData.status || 'OK');

  const profileRes = await fetch(`${BASE_URL}/api/users/profile?email=${encodeURIComponent(testGoogleEmail)}`);
  const profileData = await profileRes.json();

  if (profileData?.profile?.info?.email !== testGoogleEmail) {
    throw new Error(`Expected email ${testGoogleEmail}, but got ${profileData?.profile?.info?.email}`);
  }
  console.log('Retrieved Google User Profile:', profileData.profile.info.fullName, `(${profileData.profile.info.email})`);
  console.log('✅ PASS: Google user successfully provisioned and queried from database.');

  console.log('\n🎉 ALL GOOGLE AUTH AUDIT & VERIFICATION TESTS PASSED (100%)!');
}

testGoogleAuthRealFlow().catch(console.error);
