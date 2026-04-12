
import { analyzePrDiff } from './lib/llm-service.js';
import fs from 'fs';

async function runZeroShot() {
  const diff = fs.readFileSync('../../../src/video/abr-controller.js', 'utf8');
  
  const config = {
    endpoint: "http://127.0.0.1:11434/v1",
    model: "phi3",
    priorityFiles: ["src/video/abr-controller.js"]
  };

  console.log("🚀 Starting Zero-Shot Audit Simulation...");
  console.log("--- Project Context: [EMPTY] ---");

  const analysis = await analyzePrDiff(diff, config, "");

  if (analysis) {
    console.log("\n--- AI AUDIT RESULT ---");
    console.log("SECURITY:", analysis.security);
    console.log("LOGIC:", analysis.logic);
    console.log("SUMMARY:", analysis.summary);
  } else {
    console.log("❌ LLM Analysis failed.");
  }
}

runZeroShot();
