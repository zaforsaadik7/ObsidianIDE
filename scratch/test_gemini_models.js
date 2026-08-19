import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const envKey = process.env.GEMINI_API_KEY;
console.log('Testing GEMINI_API_KEY from env:', envKey ? `${envKey.slice(0, 8)}...` : 'NONE');

async function testApiKey(key) {
  console.log(`\nTesting key: ${key.slice(0, 10)}...`);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await res.json();
    console.log('List models response status:', res.status);
    if (res.ok && data.models) {
      console.log(`Found ${data.models.length} models:`);
      const generateModels = data.models.filter(m => m.supportedGenerationMethods?.includes('generateContent'));
      generateModels.forEach(m => {
        console.log(` - ${m.name.replace('models/', '')} (${m.displayName})`);
      });
    } else {
      console.log('Error listing models:', data);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

if (envKey) {
  testApiKey(envKey);
}
