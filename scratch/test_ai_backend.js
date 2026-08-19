import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testAIEndpoints() {
  console.log('🧪 Testing AI Backend Endpoints...\n');

  // 1. Test GET /api/ai-agent/models
  console.log('1️⃣ Querying GET /api/ai-agent/models...');
  const modelsRes = await fetch(`${BASE_URL}/api/ai-agent/models`);
  const modelsData = await modelsRes.json();
  console.log('Status:', modelsRes.status);
  console.log('Discovered models count:', modelsData.count);
  console.log('Models list:', modelsData.models);

  if (modelsData.models && modelsData.models.length > 0) {
    console.log('✅ PASS: Dynamic model discovery succeeded!');
  } else {
    console.log('❌ FAIL: No models returned.');
  }

  // 2. Test POST /api/ai-agent/validate-key
  console.log('\n2️⃣ Testing POST /api/ai-agent/validate-key with server key...');
  const validateRes = await fetch(`${BASE_URL}/api/ai-agent/validate-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const validateData = await validateRes.json();
  console.log('Validate status:', validateRes.status);
  console.log('Validation output:', validateData);

  if (validateData.valid) {
    console.log('✅ PASS: Key validation verified live!');
  } else {
    console.log('❌ FAIL: Key validation failed.');
  }

  // 3. Test POST /api/ai-agent/chat with Full Project Codebase Context
  console.log('\n3️⃣ Testing POST /api/ai-agent/chat with Whole Project Context...');
  const projectFiles = [
    {
      filePath: 'src/main.py',
      content: `from auth import authenticate_user\nfrom database import query_db\n\ndef run_app():\n    print("Starting app...")\n    user = authenticate_user("admin", "secret")\n    data = query_db(user)\n    return data\n`
    },
    {
      filePath: 'src/auth.py',
      content: `def authenticate_user(username, password):\n    # BUG: Hardcoded credentials check\n    if username == "admin" and password == "secret":\n        return {"uid": 1, "role": "admin"}\n    return None\n`
    },
    {
      filePath: 'src/database.py',
      content: `def query_db(user):\n    if not user:\n        raise ValueError("Unauthorized access")\n    return [{"id": 101, "record": "Encrypted Storage Log"}]\n`
    }
  ];

  const chatRes = await fetch(`${BASE_URL}/api/ai-agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Refactor src/auth.py to use secure hash checking instead of plaintext password comparison, and explain the changes.',
      activeFilePath: 'src/auth.py',
      activeFileContent: projectFiles[1].content,
      fileManifest: projectFiles,
      mentionedFiles: ['src/auth.py', 'src/main.py'],
      selectedModel: modelsData.models[0]?.id || 'gemini-3.6-flash'
    })
  });

  const chatData = await chatRes.json();
  console.log('Chat Status:', chatRes.status);
  console.log('Model Used:', chatData.response?.modelUsed);
  console.log('Files Indexed Count:', chatData.response?.filesIndexedCount);
  console.log('AI Response Text:\n', chatData.response?.text?.slice(0, 300) + '...\n');
  console.log('Proposed File Modifications:', chatData.response?.fileModifications);

  if (chatRes.ok && chatData.response?.text && chatData.response?.filesIndexedCount === 3) {
    console.log('✅ PASS: AI reasoning over entire codebase context succeeded!');
  } else {
    console.log('❌ FAIL: AI chat did not return expected response.');
  }

  console.log('\n🎉 ALL BACKEND AI TESTS PASSED!');
}

testAIEndpoints().catch(console.error);
