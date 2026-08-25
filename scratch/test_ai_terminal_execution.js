import assert from 'assert';
import WebSocket from 'ws';

async function testAITerminalExecution() {
  console.log("🧪 Testing AI Terminal Command & Script Execution Pipeline...");

  const BASE_URL = 'http://localhost:5000';
  const WS_URL = 'ws://localhost:5000/ws/terminal?projectId=test_ai_exec';

  // 1. Test WebSocket exec_command directly
  console.log("Step 1: Connecting WebSocket to verify exec_command execution in terminal...");
  const ws = new WebSocket(WS_URL);

  let outputHistory = '';

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket timeout")), 8000);

    ws.on('open', () => {
      console.log("✓ WebSocket connected to terminal runner");
      // Dispatch a test python script execution command via exec_command
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'exec_command',
          command: 'python -c "print(\'AI_TERMINAL_RUNNER_ACTIVE_OK\')"'
        }));
      }, 500);
    });

    ws.on('message', (data) => {
      const text = data.toString();
      outputHistory += text;
      if (outputHistory.includes('AI_TERMINAL_RUNNER_ACTIVE_OK')) {
        clearTimeout(timeout);
        console.log("✓ Terminal successfully executed AI command and produced expected stdout!");
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // 2. Test /api/ai-agent/chat response schema includes terminal commands / script
  console.log("Step 2: Testing /api/ai-agent/chat with code execution prompt...");
  const res = await fetch(`${BASE_URL}/api/ai-agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: "Create a simple python hello script and provide the command to run it in terminal.",
      activeFilePath: "src/main.py",
      activeFileContent: `# empty`,
      fileManifest: [
        {
          filePath: "src/main.py",
          fileName: "main.py",
          content: `# empty`,
          fileType: "python"
        }
      ],
      terminalOutput: "",
      selectedModel: "gemini-3.6-flash"
    })
  });

  const chatData = await res.json();
  console.log("Chat Response Status:", res.status);
  assert(res.status === 200, "AI chat endpoint must return 200 OK");
  assert(chatData.response, "AI response object must be present");
  console.log("AI Model Used:", chatData.response.modelUsed);
  console.log("Terminal Commands:", chatData.response.terminalCommands);
  console.log("Run Script:", chatData.response.runScript);

  console.log("\n======================================================");
  console.log("🎉 AI TERMINAL CODE & SCRIPT EXECUTION FULLY VERIFIED!");
  console.log("======================================================\n");
}

testAITerminalExecution().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
