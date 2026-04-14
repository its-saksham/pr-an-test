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
 * Formats a LlmAnalysis and PrData into a polished AI-first GitHub Markdown comment.
 */
export function formatLlmInsights(analysis: LlmAnalysis | null): string {
  if (!analysis) return '> ⚠️ _No AI Qualitative Review available for this diff._';

  const riskEmoji = 
    analysis.riskLevel === 'CRITICAL' ? '🔴' :
    analysis.riskLevel === 'HIGH' ? '🟠' : 
    analysis.riskLevel === 'MEDIUM' ? '🟡' : '🟢';

  return [
    '## 🤖 AI Qualitative Review',
    '',
    '> _Deep technical audit performed by Paranoid Senior Auditor (Local LLM)._',
    '',
    '### 🚦 Risk Assessment',
    '',
    `| Risk Score | Risk Level | Recommendation |`,
    `|------------|------------|----------------|`,
    `| **${analysis.riskScore}/100** | ${riskEmoji} **${analysis.riskLevel}** | ${analysis.riskLevel === 'CRITICAL' ? '🛑 **STOP: BLOCK MERGE**' : analysis.riskLevel === 'HIGH' ? '🚨 Stop & Review Carefully' : analysis.riskLevel === 'MEDIUM' ? '🔍 Manual Verification Advised' : '✅ Standard Review Process'} |`,
    '',
    '### 🚨 Critical Security Audit',
    analysis.security,
    '',
    '### 🧱 Architecture & Logic Flaws',
    analysis.logic,
    '',
    '### 📉 Performance & Technical Debt',
    analysis.optimization,
    '',
    '### 🧹 Clean Code & Maintainability Violations',
    analysis.deadCode,
    '',
    '### 📝 Executive Summary',
    analysis.summary,
    '',
  ].join('\n');
}

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
    const riskEmoji = 
      llmAnalysis.riskLevel === 'CRITICAL' ? '🔴' :
      llmAnalysis.riskLevel === 'HIGH' ? '🟠' : 
      llmAnalysis.riskLevel === 'MEDIUM' ? '🟡' : '🟢';

    aiSection = [
      '## 🤖 AI Qualitative Review',
      '',
      '> _Deep technical audit performed by Paranoid Senior Auditor (Local LLM)._',
      '',
      '### 🚦 Risk Assessment',
      '',
      `| Risk Score | Risk Level | Recommendation |`,
      `|------------|------------|----------------|`,
      `| **${llmAnalysis.riskScore}/100** | ${riskEmoji} **${llmAnalysis.riskLevel}** | ${llmAnalysis.riskLevel === 'CRITICAL' ? '🛑 **STOP: BLOCK MERGE**' : llmAnalysis.riskLevel === 'HIGH' ? '🚨 Stop & Review Carefully' : llmAnalysis.riskLevel === 'MEDIUM' ? '🔍 Manual Verification Advised' : '✅ Standard Review Process'} |`,
      '',
    ].join('\n');

    aiDetails = [
      '### 🚨 Critical Security Audit',
      llmAnalysis.security,
      '',
      '### 🧱 Architecture & Logic Flaws',
      llmAnalysis.logic,
      '',
      '### 📉 Performance & Technical Debt',
      llmAnalysis.optimization,
      '',
      '### 🧹 Clean Code & Maintainability Violations',
      llmAnalysis.deadCode,
      '',
      '### 📝 Executive Summary',
      llmAnalysis.summary,
      '',
    ].join('\n');
  }

  // ── PR Context Summary ────────────────────────────────────────────────────
  const contextSummary = [
    '### 📂 PR Context',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| 📁 Files | ${prData.fileCount} |`,
    `| 📝 Lines | +${prData.totalAdditions} / -${prData.totalDeletions} (${prData.totalChanges} total) |`,
    '',
  ].join('\n');

  // ── Risky Files Table (Based on File Classification) ─────────────────────
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
      const changeStr = `+${f.additions} / -${f.deletions}`;
      return `| \`${f.path}\` | ${changeStr} | ${tags.join(' ')} |`;
    });

    riskyFilesSection = [
      '### ⚙️ High-Impact Components Modified',
      '',
      '| File | Changes | Tags |',
      '|------|---------|------|',
      ...rows,
      '',
    ].join('\n');
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = [
    '---',
    '',
    '<sub>🤖 Generated by <strong>PR AI Auditor</strong> · ',
    'Local AI Review (Llama2) · ',
    `Analysis run: ${new Date().toUTCString()}</sub>`,
    '',
  ].join('');

  return [
    header,
    aiSection,
    '<details>',
    '<summary><b>🔍 Show Detailed Analysis & PR Context</b></summary>',
    '',
    aiDetails,
    '---',
    contextSummary,
    riskyFilesSection,
    '</details>',
    '',
    footer,
  ].join('\n');
}
