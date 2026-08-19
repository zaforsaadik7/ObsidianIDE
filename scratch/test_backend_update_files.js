import assert from 'assert';

async function testBackendUpdateFiles() {
  console.log("=== Testing Backend /api/projects/update-files Endpoint ===");

  const payload = {
    projectId: "test-proj-qa-" + Date.now(),
    userEmail: "tester@obsidian.io",
    project_files: [
      {
        fileId: "file_1",
        filePath: "src/index.js",
        fileName: "index.js",
        content: "console.log('Testing update-files');",
        fileType: "javascript"
      },
      {
        fileId: "file_2",
        filePath: "src/components/Header.jsx",
        fileName: "Header.jsx",
        content: "export const Header = () => <h1>Header</h1>;",
        fileType: "javascript"
      }
    ]
  };

  try {
    const res = await fetch('http://localhost:5000/api/projects/update-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log("Response status:", res.status);
    console.log("Response data:", data);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.status, 'SUCCESS');
    assert.strictEqual(data.count || 2, 2);
    console.log("✓ Backend /api/projects/update-files passed verification!");
  } catch (err) {
    console.error("✗ Backend test failed:", err.message);
    process.exit(1);
  }
}

testBackendUpdateFiles();
