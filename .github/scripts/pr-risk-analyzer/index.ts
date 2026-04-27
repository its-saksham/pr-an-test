/**
 * index.ts — PR Risk Analyzer Entry Point
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the full risk analysis pipeline:
 *   0. FIND    → Search for existing bot comment (for delta analysis)
 *   1. FETCH   → Pull PR data from GitHub API
 *   2. SCORE   → Run deterministic risk rules
 *   3. DELTA   → Compare current vs previous result (if exists)
 *   4. COMMENT → Format and post/update structured PR comment
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { fetchPrData, reorderDiff } from './lib/fetcher.js';
import { scorePr } from './lib/scorer.js';
import { formatComment } from './lib/formatter.js';
import { postOrUpdateComment, findExistingComment, extractInlineComments, postInlineComments } from './lib/commenter.js';
import { parsePreviousResult, computeDelta } from './lib/delta.js';
import { analyzePrDiff, synthesizeKnowledge, initializeProjectDna } from './lib/llm-service.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MEMORY_FILE = 'audit_memory.md';

// ─── Environment Configuration ────────────────────────────────────────────────
const config = {
  token:        process.env.GITHUB_TOKEN || '',
  owner:        process.env.REPO_OWNER || '',
  repo:         process.env.REPO_NAME || '',
  prNumber:     parseInt(process.env.PR_NUMBER || '0', 10),
  llmEndpoint:  process.env.LLM_ENDPOINT || '',
  llmModel:     process.env.LLM_MODEL || 'gemma4:e2b',
};

/**
 * Validates that all required environment variables are present.
 */
function validateConfig(cfg: typeof config) {
  const missing = Object.entries(cfg)
    .filter(([k, v]) => !v && k !== 'llmEndpoint' && k !== 'llmModel')
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error(`[PR Risk Analyzer] ❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (isNaN(cfg.prNumber) || cfg.prNumber === 0) {
    console.error('[PR Risk Analyzer] ❌ PR_NUMBER must be a valid non-zero integer.');
    process.exit(1);
  }
}

/**
 * Ensures the script is NOT running with Administrative privileges on Windows.
 */
function checkNonAdmin() {
  if (process.platform !== 'win32') return;

  try {
    const output = execSync('whoami /groups', { encoding: 'utf8' });
    // S-1-16-12288 is the High Mandatory Level SID (Administrator)
    if (output.includes('S-1-16-12288')) {
      console.error('[PR Risk Analyzer] 🛑 SECURITY ERROR: This script is running as ADMINISTRATOR.');
      console.error('[PR Risk Analyzer] 🛑 For safety, this analyzer must run as a standard user.');
      process.exit(1);
    }
  } catch (err) {
    console.warn('[PR Risk Analyzer] ⚠️ Could not verify administrative status.');
  }
}

/**
 * Main orchestration function.
 */
async function run() {
  console.log('[PR Risk Analyzer] 🚀 Starting analysis...');

  checkNonAdmin();
  validateConfig(config);

  const { token, owner, repo, prNumber, llmEndpoint, llmModel } = config;

  // ── Pre-run Diagnostic: Test LLM Connectivity ──────────────────────────────
  if (llmEndpoint) {
    try {
      console.log(`[PR Risk Analyzer] 🌐 Diagnostic: Pinging LLM at ${llmEndpoint}...`);
      await fetch(llmEndpoint, { method: 'HEAD' });
      console.log('[PR Risk Analyzer] 🌐 Diagnostic: LLM Endpoint is reachable.');
    } catch (err: any) {
      console.warn(`[PR Risk Analyzer] 🌐 Diagnostic: LLM Endpoint UNREACHABLE: ${err.message}`);
    }
  }

  // ── Stage 0: Check for existing comment ───────────────────────────────────
  console.log('[PR Risk Analyzer] 🔍 Checking for existing analysis comment...');
  let existingComment = null;
  try {
    existingComment = await findExistingComment({ token, owner, repo, prNumber });
  } catch (err: any) {
    console.warn('[PR Risk Analyzer] ⚠️ Could not fetch existing comment (skipping delta):', err.message);
  }

  // ── Stage 1: Fetch PR Data ─────────────────────────────────────────────────
  console.log(`[PR Risk Analyzer] 📡 Fetching data for PR #${prNumber} (${owner}/${repo})...`);
  let prData;
  try {
    prData = await fetchPrData({ token, owner, repo, prNumber });
  } catch (err: any) {
    console.error('[PR Risk Analyzer] ❌ Failed to fetch PR data:', err.message);
    process.exit(1);
    throw err; // For type inference
  }

  const diffSize = prData.fullDiff ? prData.fullDiff.length : 0;
  console.log(
    `[PR Risk Analyzer] 📊 PR data fetched: ${prData.fileCount} files, ` +
    `${prData.totalChanges} lines changed. Diff Size: ${diffSize} chars.`
  );

  // ── Stage 1.7: Load Project Memory ──────────────────────────────
  let projectContext = '';
  if (fs.existsSync(MEMORY_FILE)) {
    console.log(`[PR Risk Analyzer] 🧠 Loading project memory from ${MEMORY_FILE}...`);
    projectContext = fs.readFileSync(MEMORY_FILE, 'utf8');
  }

  // ── Stage 2: AI Qualitative Analysis ──────────────────────────
  let llmAnalysis = null;
  if (llmEndpoint && prData.fullDiff && prData.fullDiff.trim().length > 0) {
    console.log('[PR Risk Analyzer] 🤖 Performing qualitative AI analysis...');
    
    // REORDER DIFF: Put high-risk code (critical/config) at the top based on scorer tags
    const prioritizedDiff = reorderDiff(prData.fullDiff || '', prData.fileDetails);
    
    console.log(`[PR Risk Analyzer] 📊 Prioritized Diff Size: ${prioritizedDiff.length} chars.`);
    console.log(`[PR Risk Analyzer] 📊 Diff Preview: ${prioritizedDiff.substring(0, 100).replace(/\n/g, ' ')}...`);

    // ATTENTION GUIDANCE: List critical files for the AI to focus on
    const highPriorityFiles = prData.fileDetails
      .filter(f => f.isCritical)
      .map(f => f.path);

    const startTime = Date.now();
    llmAnalysis = await analyzePrDiff(prioritizedDiff, { 
      endpoint: llmEndpoint, 
      model: llmModel,
      priorityFiles: highPriorityFiles
    }, projectContext);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`[PR Risk Analyzer] 🤖 AI Analysis completed in ${duration}s.`);

    // ── Stage 2.5: Knowledge Synthesis (Learning & Bootstrapping) ──────────
    if (llmAnalysis) {
      console.log('[PR Risk Analyzer] 🧠 Learning Phase...');

      // BOOTSTRAP CHECK: If memory is empty or very short, do a full DNA Initialization
      // We check for < 100 chars to account for headers or boilerplate
      const isFirstRun = projectContext.trim().length < 100;

      if (isFirstRun) {
        console.log('[PR Risk Analyzer] 🧬 Bootstrapping Initial Project DNA...');
        const initialDna = await initializeProjectDna(
          prioritizedDiff, 
          { endpoint: llmEndpoint, model: llmModel }, 
          llmAnalysis.summary
        );

        if (initialDna) {
          fs.writeFileSync(MEMORY_FILE, initialDna);
          console.log('[PR Risk Analyzer] ✅ Project DNA autonomously initialized.');
        }
      } else {
        console.log('[PR Risk Analyzer] 🧠 Synthesizing new technical knowledge...');
        const newWisdom = await synthesizeKnowledge(
          prioritizedDiff, 
          { endpoint: llmEndpoint, model: llmModel }, 
          llmAnalysis.summary
        );

        if (newWisdom && newWisdom.trim().length > 0) {
          const timestamp = new Date().toISOString().split('T')[0];
          const updatedMemory = `\n- **${timestamp}**: ${newWisdom.trim()}\n`;
          fs.appendFileSync(MEMORY_FILE, updatedMemory);
          console.log('[PR Risk Analyzer] ✅ Project memory updated with new insights.');
        }
      }
    }
  }

  // ── Stage 3: Format & Post Comment ────────────────────────────────────────
  console.log('[PR Risk Analyzer] 💬 Formatting comment...');
  // No longer using deterministic scoring rules. AI is the sole source of Risk metrics.
  const commentBody = formatComment(null, prData, null, llmAnalysis);

  console.log('[PR Risk Analyzer] 📝 Creating analysis comment (and purging previous runs)...');
  let commentResult;
  try {
    commentResult = await postOrUpdateComment({
      token,
      owner,
      repo,
      prNumber,
      body: commentBody,
    });
  } catch (err: any) {
    console.error('[PR Risk Analyzer] ❌ Failed to post comment:', err.message);
    process.exit(1);
    throw err; // For type inference
  }

  console.log(
    `[PR Risk Analyzer] ✅ Comment ${commentResult.action} successfully: ${commentResult.commentUrl}`
  );

  // ── Post Inline Comments ──────────────────────────────────────────────────
  if (llmAnalysis && prData.headSha) {
    console.log(`[PR Risk Analyzer] 🔍 LLM Analysis - Security: ${llmAnalysis.security.substring(0, 100)}...`);
    console.log(`[PR Risk Analyzer] 🔍 LLM Analysis - Logic: ${llmAnalysis.logic.substring(0, 100)}...`);
    console.log(`[PR Risk Analyzer] 🔍 Raw LLM Response contains LOCATOR: ${llmAnalysis.raw?.includes('LOCATOR')}`);
    console.log(`[PR Risk Analyzer] 🔍 Raw LLM Response length: ${llmAnalysis.raw?.length}`);
    console.log(`[PR Risk Analyzer] 🔍 Security Locator: ${llmAnalysis.securityLocator}`);
    console.log(`[PR Risk Analyzer] 🔍 Logic Locator: ${llmAnalysis.logicLocator}`);
    if (llmAnalysis.raw) {
      try {
        const parsedRaw = JSON.parse(llmAnalysis.raw);
        console.log(`[PR Risk Analyzer] 🔍 Parsed security field: ${parsedRaw.security}`);
        console.log(`[PR Risk Analyzer] 🔍 Parsed logic field: ${parsedRaw.logic}`);
        console.log(`[PR Risk Analyzer] 🔍 Parsed securityLocator: ${parsedRaw.securityLocator}`);
        console.log(`[PR Risk Analyzer] 🔍 Parsed logicLocator: ${parsedRaw.logicLocator}`);
      } catch (e) {
        console.log(`[PR Risk Analyzer] ⚠️ Could not parse raw response: ${e}`);
      }
    }
    console.log(`[PR Risk Analyzer] 🔍 Head SHA: ${prData.headSha}`);
    const inlineComments = extractInlineComments(llmAnalysis);
    if (inlineComments.length > 0) {
      console.log(`[PR Risk Analyzer] 💬 Posting ${inlineComments.length} inline comment(s)...`);
      await postInlineComments({
        token,
        owner,
        repo,
        prNumber,
        commitId: prData.headSha,
        comments: inlineComments,
        diff: prData.fullDiff || '',
      });
      console.log(`[PR Risk Analyzer] 📊 Diff length: ${(prData.fullDiff || '').length} characters`);
      console.log('[PR Risk Analyzer] ✅ Inline comments posted.');
    } else {
      console.log('[PR Risk Analyzer] ℹ️ No inline comments to post.');
    }
  } else {
    console.log(`[PR Risk Analyzer] ℹ️ Skipping inline comments - LLM analysis: ${!!llmAnalysis}, Head SHA: ${!!prData.headSha}`);
  }

  console.log('[PR Risk Analyzer] 🏁 Analysis complete.');
}

run().catch((err) => {
  console.error('[PR Risk Analyzer] 💥 Unhandled error:', err);
  process.exit(1);
});
