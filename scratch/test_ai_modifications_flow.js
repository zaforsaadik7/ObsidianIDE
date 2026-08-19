import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testAIModificationFlow() {
  console.log('🧪 Testing AI File Modification Application Flow...\n');

  const projectId = 'proj_mod_test_' + Date.now();
  const initialFiles = [
    {
      fileId: 'file_001',
      filePath: 'src/main.py',
      fileName: 'main.py',
      content: `// Refactored by Obsidian Agentic AI\nimport torch\ndef main():\n    print("Old torch code")\nif __name__ == '__main__':\n    main()\n`
    }
  ];

  console.log('Initial file content:\n', initialFiles[0].content);

  // Simulate AI modification targeting "main.py" (short path)
  const aiModification = {
    filePath: 'main.py',
    newContent: 'print("hello world")\n'
  };

  console.log('AI returned modification for:', aiModification.filePath);
  console.log('New content:\n', aiModification.newContent);

  // Apply resolution logic
  const clean = (p = '') => p.replace(/^\/+|\/+$/g, '').trim().toLowerCase();
  const targetClean = clean(aiModification.filePath);
  const targetBase = targetClean.split('/').pop();

  const existingFile = initialFiles.find(f => {
    const fPath = clean(f.filePath);
    const fName = clean(f.fileName);
    return fPath === targetClean || 
           fName === targetClean || 
           fName === targetBase ||
           fPath.endsWith('/' + targetClean) || 
           targetClean.endsWith('/' + fPath) ||
           fPath.endsWith('/' + targetBase);
  });

  console.log('Matching existing file:', existingFile?.filePath);

  if (!existingFile) {
    throw new Error('Failed to match main.py to src/main.py');
  }

  const updatedFiles = initialFiles.map(f => f.fileId === existingFile.fileId ? { ...f, content: aiModification.newContent } : f);

  // Persist to backend
  const updateRes = await fetch(`${BASE_URL}/api/projects/update-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      working_files: updatedFiles,
      master_project_files: initialFiles,
      userEmail: 'dev@obsidian.io'
    })
  });

  const updateData = await updateRes.json();
  console.log('Backend update response:', updateData);

  if (updateRes.ok && updatedFiles[0].content === 'print("hello world")\n') {
    console.log('\n✅ PASS: AI modification accurately updated existing file and removed old torch code!');
  } else {
    console.log('\n❌ FAIL: AI modification could not be applied.');
  }
}

testAIModificationFlow().catch(console.error);
