/**
 * formatter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Formats a ScoringResult and PrData into a polished GitHub Markdown comment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { buildDataMarker, Delta } from './delta.js';
import { PrData, FileDetail, LlmAnalysis } from './scoring-rules.js';
import { ScoringResult, TriggeredRule } from './scorer.js';

// Max number of risky files to surface inline in the comment
const MAX_RISKY_FILES_SHOWN = 8;
// Max number of "passed" checks to list in the summary
const MAX_PASSED_SHOWN = 5;


/**
 * Builds the full Markdown PR comment from AI insights and raw PR data.
 */
export function formatComment(
  _result: any, 
  prData: PrData, 
  _delta: any,
  llmAnalysis: LlmAnalysis | null = null
): string {
  // ── Header ────────────────────────────────────────────────────────────────
  const header = [
    '# 🚦 AI PR Analysis',
    '',
    '> **Line-by-line verification** powered by local LLM.',
    '',
    '---',
  ].join('\n');

  // ── AI Insights ───────────────────────────────────────────────────────────
  let aiSection = '';
  let aiDetails = '';

  if (!llmAnalysis) {
    aiSection = '> ⚠️ _No AI Qualitative Review available for this diff._';
  } else {
    let alertType = '[!TIP]';
    let recommendation = '✅ Standard Review Process';
    if (llmAnalysis.riskLevel === 'CRITICAL') { alertType = '[!CAUTION]'; recommendation = '🛑 **MERGE BLOCKED.** Severe vulnerabilities detected.'; }
    else if (llmAnalysis.riskLevel === 'HIGH') { alertType = '[!WARNING]'; recommendation = '🚨 Stop & Review Carefully.'; }
    else if (llmAnalysis.riskLevel === 'MEDIUM') { alertType = '[!IMPORTANT]'; recommendation = '🔍 Manual Verification Advised.'; }

    aiSection = [
      `## 🛡️ AI Risk Audit: ${llmAnalysis.riskLevel}`,
      '',
      `> ${alertType}`,
      `> **Risk Score: ${llmAnalysis.riskScore}/100** — ${recommendation}`,
      '',
    ].join('\n');

    aiDetails = [
      '> [!IMPORTANT]',
      '> **🚨 Critical Security Risks**',
      `> ${llmAnalysis.security.replace(/\\n/g, '\n> ')}`,
      '',
      '> [!WARNING]',
      '> **🧱 Architecture & Logic Flaws**',
      `> ${llmAnalysis.logic.replace(/\\n/g, '\n> ')}`,
      '',
      '> [!TIP]',
      '> **📉 Tech Debt & Maintainability**',
      `> *Performance*: ${llmAnalysis.optimization.replace(/\\n/g, '\n> ')}`,
      `> *Clean Code*: ${(llmAnalysis.cleanCode || 'Acceptable.').replace(/\\n/g, '\n> ')}`,
      '',
      `> **Executive Summary:** ${llmAnalysis.summary}`,
      '',
    ].join('\n');
  }

  // ── PR Context Summary ────────────────────────────────────────────────────
  const contextSummary = [
    '### 📊 PR Context & Metadata',
    `* **Files Changed:** ${prData.fileCount} (*+${prData.totalAdditions} / -${prData.totalDeletions} lines*)`,
    '',
  ].join('\n');

  // ── Risky Files Table ──────────────────────────────────────────────────────
  const riskyFiles = prData.fileDetails
    .filter((f: FileDetail) => f.isCritical || f.isImportant || f.isConfig)
    .sort((a: any, b: any) => b.changes - a.changes)
    .slice(0, MAX_RISKY_FILES_SHOWN);

  let riskyFilesSection = '';
  if (riskyFiles.length > 0) {
    const rows = riskyFiles.map((f: FileDetail) => {
      const tags = [];
      if (f.isCritical) tags.push('`critical`');
      if (f.isImportant) tags.push('`important`');
      if (f.isConfig) tags.push('`config`');
      const changeStr = `+${f.additions}/-${f.deletions}`;
      return `| \`${f.path}\` | ${changeStr} | ${tags.join(' ')} |`;
    });

    riskyFilesSection = [
      '| High Impact Component | Diff | Tags |',
      '| :--- | :--- | :--- |',
      ...rows,
      '',
    ].join('\n');
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = [
    '<br>',
    '<sub>🤖 Authenticated by <strong>Local AI Review</strong> (Gemma 4)</sub>',
    '',
  ].join('\n');

  return [
    aiSection,
    '---',
    '<details>',
    '<summary><b>🔍 View Deep Technical Analysis & Context</b></summary>',
    '<br>',
    '',
    aiDetails,
    '---',
    contextSummary,
    riskyFilesSection,
    '</details>',
    footer,
  ].join('\n');
}
