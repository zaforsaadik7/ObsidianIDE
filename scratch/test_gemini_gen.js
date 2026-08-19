import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function testGeneration() {
  console.log('Testing content generation with key:', apiKey.slice(0, 10));
  const genAI = new GoogleGenerativeAI(apiKey);

  const modelsToTest = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-pro',
    'gemini-flash-latest'
  ];

  for (const modelName of modelsToTest) {
    console.log(`\n--- Testing model: ${modelName} ---`);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say hello in 5 words.');
      console.log(`✅ Success for ${modelName}:`, result.response.text());
    } catch (err) {
      console.error(`❌ Failed for ${modelName}:`, err.message);
    }
  }
}

testGeneration();
