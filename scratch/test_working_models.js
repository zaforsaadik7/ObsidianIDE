import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function testWorkingModels() {
  const genAI = new GoogleGenerativeAI(apiKey);

  const candidates = [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-flash-lite-latest',
    'gemini-pro-latest'
  ];

  const working = [];

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say hello in 5 words.');
      const text = result.response.text();
      console.log(`✅ WORKING: ${modelName} -> "${text.trim()}"`);
      working.push(modelName);
    } catch (err) {
      console.log(`❌ Failed: ${modelName} -> ${err.message.slice(0, 100)}`);
    }
  }

  console.log('\nFinal Working Models List:', working);
}

testWorkingModels();
