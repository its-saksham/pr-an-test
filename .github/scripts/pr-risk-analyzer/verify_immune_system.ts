
import { analyzePrDiff, initializeProjectDna } from './lib/llm-service.js';
import fs from 'node:fs';

async function runStage1Audit() {
  const diff = fs.readFileSync('../../../src/video/concurrency-guard.js', 'utf8');
  
  const config = {
    endpoint: "http://127.0.0.1:11434/v1",
    model: "phi3",
    priorityFiles: ["src/video/concurrency-guard.js"]
  };

  console.log("🚀 Running Stage 1 Audit: Concurrency Race Condition Challenge...");
  
  // 1. Audit logic
  const analysis = await analyzePrDiff(diff, config, ""); // Empty context for bootstrap

  if (analysis) {
    console.log("\n--- AI AUDIT FINDINGS ---");
    console.log("LOGIC:", analysis.logic);
    
    // 2. Autonomous Initialization (Inoculation)
    console.log("\n🧪 AI Inoculation Phase: Bootstrapping DNA...");
    const initialDna = await initializeProjectDna(diff, config, analysis.summary);
    
    if (initialDna) {
      fs.writeFileSync('../../../audit_memory.md', initialDna);
      console.log("✅ Project DNA Inoculated with Atomicity Invariants.");
      console.log("\n--- UPDATED DNA ---");
      console.log(initialDna.split('---')[0]); // Show the top part
    }
  }
}

runStage1Audit();
