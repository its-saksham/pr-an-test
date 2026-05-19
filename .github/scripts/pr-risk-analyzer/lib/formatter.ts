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

export function renderScoreBar(value: number, max: number, width: number): string {
  const filled = Math.round((value / max) * width);
  const empty = Math.max(0, width - filled);
  const percentage = Math.round((value / max) * 100);

  // Color coding based on risk level
  let color = '🟢'; // Green for low risk
  if (percentage >= 70) color = '🔴'; // Red for high risk
  else if (percentage >= 40) color = '🟡'; // Yellow for medium risk

  return `${color} ${'█'.repeat(filled)}${'░'.repeat(empty)} ${percentage}%`;
}

/**
 * Builds the full Markdown PR comment from AI insights and raw PR data.
 */
export function formatComment(
  _result: any, 
  prData: PrData, 
  _delta: any = null,
  llmAnalysis: LlmAnalysis | null = null
): string {
  // ── Header ────────────────────────────────────────────────────────────────
  const header = [
    '# 🚦 **AI-Powered PR Risk Analysis**',
    '',
    '<details>',
    '<summary>📊 **Analysis Summary**</summary>',
    '',
    '> **🔍 Analysis Type**: Line-by-line security & logic verification',
    '> **🤖 AI Engine**: Local LLM-powered audit',
    '> **⚡ Processing**: Real-time diff analysis',
    '',
    '</details>',
    '',
    '---',
  ].join('\n');

  // ── AI Insights ───────────────────────────────────────────────────────────
  let aiSection = '';
  let aiDetails = '';

  const formatLocatorAwareField = (text: string, fallback: string): string => {
    const normalized = (text || fallback || '').trim();
    const locatorMatch = normalized.match(/LOCATOR:\s*\[([^\]]+)\]\s*$/m);
    const locator = locatorMatch?.[1];
    const message = locator
      ? normalized.replace(/LOCATOR:\s*\[[^\]]+\]\s*$/m, '').trim()
      : normalized;

    const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (locator) {
      const firstLine = `> - ${lines.shift() || ''}`;
      const restLines = lines.map((line) => `>   ${line}`);
      return [firstLine, ...restLines, `>   _Locator:_ \`${locator}\``].join('\n');
    }

    return `> ${lines.join('\n> ')}`;
  };

  if (!llmAnalysis) {
    aiSection = [
      '> [!WARNING]',
      '> **⚠️ AI Analysis Unavailable**',
      '> Could not perform qualitative security audit. Check LLM connectivity.',
      '> Manual code review recommended.',
    ].join('\n');
  } else {
    // Risk level indicators with better visual design
    let alertType = '[!TIP]';
    let recommendation = '✅ **APPROVED** - Standard review process';
    let riskIcon = '🟢';
    let riskColor = 'green';

    if (llmAnalysis.riskLevel === 'CRITICAL') {
      alertType = '[!DANGER]';
      recommendation = '🚫 **BLOCKED** - Critical vulnerabilities detected';
      riskIcon = '🔴';
      riskColor = 'red';
    } else if (llmAnalysis.riskLevel === 'HIGH') {
      alertType = '[!CAUTION]';
      recommendation = '⚠️ **STOP & REVIEW** - High-risk changes require careful inspection';
      riskIcon = '🟠';
      riskColor = 'orange';
    } else if (llmAnalysis.riskLevel === 'MEDIUM') {
      alertType = '[!WARNING]';
      recommendation = '🔍 **REVIEW REQUIRED** - Manual verification advised';
      riskIcon = '🟡';
      riskColor = 'yellow';
    }

    aiSection = [
      `## ${riskIcon} **AI Risk Assessment: ${llmAnalysis.riskLevel}**`,
      '',
      `> ${alertType}`,
      `> **Risk Score**: ${renderScoreBar(llmAnalysis.riskScore, 100, 20)}`,
      `> **Recommendation**: ${recommendation}`,
      '',
    ].join('\n');

    aiDetails = [
      '<details>',
      '<summary>🔍 **Detailed Analysis**</summary>',
      '',
      '> [!IMPORTANT]',
      '> **🚨 Critical Security Issues**',
      `> ${formatLocatorAwareField(llmAnalysis.security, '✅ No critical security concerns detected.')}`,
      '',
      '> [!WARNING]',
      '> **🧱 Architecture & Logic Issues**',
      `> ${formatLocatorAwareField(llmAnalysis.logic, '✅ Logic appears sound and consistent.')}`,
      '',
      '> [!TIP]',
      '> **📈 Performance & Maintainability**',
      `> *⚡ Performance*: ${formatLocatorAwareField(llmAnalysis.optimization, '✅ Performance metrics are within acceptable limits.')}`,
      `> *🧹 Code Quality*: ${formatLocatorAwareField(llmAnalysis.cleanCode || 'Acceptable.', '✅ Code follows maintainability standards.')}`,
      '',
      `> **📋 Executive Summary**: ${llmAnalysis.summary}`,
      '',
      '</details>',
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
