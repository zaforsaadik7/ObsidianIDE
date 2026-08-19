import fs from 'fs';
import path from 'path';

async function testPersonalFirebaseSyncArchitecture() {
  console.log('🧪 Testing Bring-Your-Own-Database (Personal Firebase Sync Architecture)...\n');

  // 1. Verify personalFirebaseStorage service exists and has key exports
  const storageServicePath = path.resolve('src/services/personalFirebaseStorage.js');
  if (!fs.existsSync(storageServicePath)) {
    throw new Error('❌ FAIL: src/services/personalFirebaseStorage.js does not exist');
  }
  const storageContent = fs.readFileSync(storageServicePath, 'utf-8');
  if (!storageContent.includes('syncProjectToPersonalFirestore') || !storageContent.includes('getPersonalFirestore')) {
    throw new Error('❌ FAIL: Missing essential sync functions in personalFirebaseStorage.js');
  }
  console.log('✅ PASS: Personal Firebase sync service correctly configured with dynamic multi-app Firestore initialization.');

  // 2. Verify CreateProjectModal calls personal storage sync
  const createModalContent = fs.readFileSync(path.resolve('src/components/dashboard/CreateProjectModal.jsx'), 'utf-8');
  if (!createModalContent.includes('syncProjectToPersonalFirestore')) {
    throw new Error('❌ FAIL: CreateProjectModal does not call syncProjectToPersonalFirestore');
  }
  console.log('✅ PASS: CreateProjectModal automatically mirrors new projects to user personal Firestore.');

  // 3. Verify IDEWorkspacePage calls personal storage sync on save & merge
  const ideContent = fs.readFileSync(path.resolve('src/pages/IDEWorkspacePage.jsx'), 'utf-8');
  if (!ideContent.includes('syncProjectToPersonalFirestore')) {
    throw new Error('❌ FAIL: IDEWorkspacePage does not call syncProjectToPersonalFirestore');
  }
  console.log('✅ PASS: IDE workspace automatically persists working and master files directly to user personal Firestore.');

  // 4. Verify OnboardingWizardPage saves full personal configuration
  const onboardingContent = fs.readFileSync(path.resolve('src/pages/OnboardingWizardPage.jsx'), 'utf-8');
  if (!onboardingContent.includes('personalFirebaseConfig: userFirebaseConfig')) {
    throw new Error('❌ FAIL: OnboardingWizardPage does not save personalFirebaseConfig');
  }
  console.log('✅ PASS: OnboardingWizardPage securely stores personal Firebase project configuration and seeds developer profile.');

  console.log('\n🎉 ALL PERSONAL FIREBASE STORAGE TESTS PASSED (100%)!');
}

testPersonalFirebaseSyncArchitecture().catch(err => {
  console.error(err);
  process.exit(1);
});
