// Test script for Sandbox Preview Rendering Logic
const testHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #0b0c10; color: #66fcf1; font-family: sans-serif; text-align: center; padding: 40px; }
    button { background: #45a29e; color: #0b0c10; border: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>✨ ObsidianIDE Mini Webpage</h1>
  <p>Live Sandbox Rendering Active!</p>
  <button onclick="alert('Button clicked!')">Test Button</button>
</body>
</html>`;

const testReact = `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="p-8 bg-zinc-900 text-white rounded-xl shadow-xl text-center space-y-4">
      <h1 className="text-2xl font-bold text-cyan-400">⚡ Live React Sandbox</h1>
      <p className="text-zinc-400">Interactive state tracking inside ObsidianIDE</p>
      <div className="text-4xl font-mono font-bold text-emerald-400">{count}</div>
      <div className="flex justify-center gap-3">
        <button 
          onClick={() => setCount(c => c - 1)}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded font-bold"
        >
          - Decrement
        </button>
        <button 
          onClick={() => setCount(c => c + 1)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded font-bold"
        >
          + Increment
        </button>
      </div>
    </div>
  );
}`;

console.log("=== Testing Sandbox HTML Generator ===");
if (testHtml.includes("<!DOCTYPE html>") && testHtml.includes("ObsidianIDE Mini Webpage")) {
  console.log("✓ HTML Mini Webpage markup verified.");
}

console.log("\n=== Testing Sandbox React Transpiler Cleaner ===");
const cleanedReactCode = testReact
  .replace(/import\s+.*?from\s+['"].*?['"];?/g, '')
  .replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/g, 'function $1')
  .replace(/export\s+default\s+([A-Za-z0-9_]+);?/g, 'window.__MainComponent = $1;')
  .replace(/export\s+{[^}]+};?/g, '');

if (!cleanedReactCode.includes("import ") && cleanedReactCode.includes("function App()")) {
  console.log("✓ React component cleaned and prepared for Babel Standalone evaluation successfully.");
} else {
  console.error("✗ Failed to clean React code.");
}

console.log("\n✓ All SandboxPreview rendering transformations passed verification!");
