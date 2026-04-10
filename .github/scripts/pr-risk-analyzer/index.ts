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

import { fetchPrData } from './lib/fetcher.js';
import { scorePr } from './lib/scorer.js';
import { formatComment } from './lib/formatter.js';
import { postOrUpdateComment, findExistingComment } from './lib/commenter.js';
import { parsePreviousResult, computeDelta } from './lib/delta.js';
import { analyzePrDiff } from './lib/llm-service.js';

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
 * Main orchestration function.
 */
async function run() {
  console.log('[PR Risk Analyzer] 🚀 Starting analysis...');

  validateConfig(config);

  const { token, owner, repo, prNumber, llmEndpoint, llmModel } = config;

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

  console.log(
    `[PR Risk Analyzer] 📊 PR data fetched: ${prData.fileCount} files, ` +
    `${prData.totalChanges} lines changed.`
  );

  // ── Stage 1.5: LLM Qualitative Analysis (Optional) ──────────────────────────
  let llmAnalysis = null;
  if (llmEndpoint && prData.fullDiff) {
    console.log('[PR Risk Analyzer] 🤖 Performing qualitative AI analysis...');
    llmAnalysis = await analyzePrDiff(prData.fullDiff, { endpoint: llmEndpoint, model: llmModel });
  } else if (llmEndpoint) {
    console.warn('[PR Risk Analyzer] ⚠️ LLM_ENDPOINT provided but no diff content available.');
  }

  // ── Stage 2: Score PR ──────────────────────────────────────────────────────
  console.log('[PR Risk Analyzer] 🧮 Running scoring engine...');
  const result = scorePr(prData);

  // ── Stage 2.5: Compute Delta ──────────────────────────────────────────────
  let delta = null;
  if (existingComment) {
    const previousResult = parsePreviousResult(existingComment.body);
    if (previousResult) {
      console.log('[PR Risk Analyzer] 📈 Computing risk delta from previous run...');
      delta = computeDelta(result, previousResult);
    }
  }

  console.log(
    `[PR Risk Analyzer] 🎯 Score: ${result.totalScore}/${result.maxScore} → ` +
    `${result.riskEmoji} ${result.riskLevel}`
  );

  // ── Stage 3: Format & Post Comment ────────────────────────────────────────
  console.log('[PR Risk Analyzer] 💬 Formatting comment...');
  const commentBody = formatComment(result, prData, delta, llmAnalysis);

  console.log('[PR Risk Analyzer] 📝 Posting comment to PR...');
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
