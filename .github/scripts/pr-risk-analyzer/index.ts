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
import { postOrUpdateComment, findExistingComment } from './lib/commenter.js';
import { parsePreviousResult, computeDelta } from './lib/delta.js';
import { analyzePrDiff } from './lib/llm-service.js';
import { execSync } from 'child_process';

// ─── Environment Configuration ────────────────────────────────────────────────
const config = {
  token:        process.env.GITHUB_TOKEN || '',
  owner:        process.env.REPO_OWNER || '',
  repo:         process.env.REPO_NAME || '',
  prNumber:     parseInt(process.env.PR_NUMBER || '0', 10),
  llmEndpoint:  process.env.LLM_ENDPOINT || '',
  llmModel:     process.env.LLM_MODEL || 'phi3',
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

  // ── Stage 2: AI Qualitative Analysis ──────────────────────────
  let llmAnalysis = null;
  if (llmEndpoint && prData.fullDiff && prData.fullDiff.trim().length > 0) {
    console.log('[PR Risk Analyzer] 🤖 Performing qualitative AI analysis...');
    
    // REORDER DIFF: Put high-risk code (critical/config) at the top based on scorer tags
    // (We still use fileDetails from Stage 1 for reordering, even without scoring)
    const prioritizedDiff = reorderDiff(prData.fullDiff || '', prData.fileDetails);
    
    llmAnalysis = await analyzePrDiff(prioritizedDiff, { endpoint: llmEndpoint, model: llmModel });
  }

  // ── Stage 3: Format & Post Comment ────────────────────────────────────────
  console.log('[PR Risk Analyzer] 💬 Formatting comment...');
  // Pass null for result and delta as we are removing scoring
  const commentBody = formatComment(null as any, prData, null as any, llmAnalysis);

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
  console.log('[PR Risk Analyzer] 🏁 Analysis complete.');
}

run().catch((err) => {
  console.error('[PR Risk Analyzer] 💥 Unhandled error:', err);
  process.exit(1);
});
