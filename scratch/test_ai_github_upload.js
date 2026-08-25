import assert from 'assert';

async function testAIGitHubUpload() {
  console.log("🧪 Testing AI GitHub Upload & Push Pipeline...");

  const BASE_URL = 'http://localhost:5000';

  // 1. Test AI chat with explicitly provided GitHub repo URL in prompt
  console.log("Step 1: Testing AI with explicit GitHub repo URL in user prompt...");
  const res1 = await fetch(`${BASE_URL}/api/ai-agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: "Please upload and push this project to my repository https://github.com/zaforsaadik7/my-awesome-app",
      activeFilePath: "src/main.py",
      activeFileContent: "print('Hello world')",
      fileManifest: [
        { filePath: "src/main.py", fileName: "main.py", content: "print('Hello world')", fileType: "python" }
      ],
      githubInfo: {
        connected: true,
        username: "zaforsaadik7"
      },
      projectInfo: {
        projectId: "test-github-proj",
        title: "My Awesome App",
        githubRepoUrl: ""
      },
      selectedModel: "gemini-3.6-flash"
    })
  });

  const data1 = await res1.json();
  console.log("Step 1 Status:", res1.status);
  assert(res1.status === 200, "AI chat must return 200");
  assert(data1.response, "Response object must be present");
  console.log("Step 1 githubAction:", data1.response.githubAction);
  assert(data1.response.githubAction, "AI must generate githubAction for GitHub upload prompt");
  assert(
    data1.response.githubAction.repoUrl.includes('zaforsaadik7/my-awesome-app'),
    "githubAction must target the user's provided repository URL"
  );
  console.log("✓ Step 1 Passed: AI correctly extracted and generated GitHub upload action for provided repository URL!");

  // 2. Test AI chat when project is already connected to a repository
  console.log("\nStep 2: Testing AI when project is already connected to a GitHub repository...");
  const res2 = await fetch(`${BASE_URL}/api/ai-agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: "Commit all our changes and push to GitHub now please",
      activeFilePath: "src/main.py",
      activeFileContent: "print('Hello world 2')",
      fileManifest: [
        { filePath: "src/main.py", fileName: "main.py", content: "print('Hello world 2')", fileType: "python" }
      ],
      githubInfo: {
        connected: true,
        username: "zaforsaadik7"
      },
      projectInfo: {
        projectId: "test-github-proj",
        title: "My Awesome App",
        githubRepoUrl: "https://github.com/zaforsaadik7/ObsidianIDE"
      },
      selectedModel: "gemini-3.6-flash"
    })
  });

  const data2 = await res2.json();
  console.log("Step 2 Status:", res2.status);
  assert(res2.status === 200, "AI chat must return 200");
  console.log("Step 2 githubAction:", data2.response.githubAction);
  assert(data2.response.githubAction, "AI must generate githubAction using the already connected repository");
  assert(
    data2.response.githubAction.repoUrl.includes('ObsidianIDE'),
    "githubAction must target the project's linked repository"
  );
  console.log("✓ Step 2 Passed: AI correctly targeted the already linked GitHub repository!");

  console.log("\n======================================================");
  console.log("🎉 AI GITHUB UPLOAD & REPO INTEGRATION FULLY VERIFIED!");
  console.log("======================================================\n");
}

testAIGitHubUpload().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
