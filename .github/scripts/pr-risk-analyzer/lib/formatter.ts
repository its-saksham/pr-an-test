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
 * Renders a horizontal score bar (ASCII progress bar) representing
 * the confidence/risk level visually.
 */
export function renderScoreBar(score: number, maxScore: number, barWidth = 20): string {
  const filled = Math.min(barWidth, Math.max(0, Math.round((score / maxScore) * barWidth)));
  const empty = barWidth - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Returns a Markdown badge-style label for the risk level.
 */
function formatRiskBadge(level: string, emoji: string): string {
  const labels: Record<string, string> = { HIGH: '🔴 HIGH', MEDIUM: '🟡 MEDIUM', LOW: '🟢 LOW' };
  return `**${labels[level] ?? `${emoji} ${level}`}**`;
}

/**
 * Formats the list of risky files with change counts and type badges.
 */
function formatRiskyFiles(fileDetails: FileDetail[]): string {
  const riskyFiles = fileDetails
    .filter((f: FileDetail) => f.isCritical || f.isConfig)
    .sort((a, b) => b.changes - a.changes)
    .slice(0, MAX_RISKY_FILES_SHOWN);

  if (riskyFiles.length === 0) return '';

  const rows = riskyFiles.map((f: FileDetail) => {
    const tags = [];
    if (f.isCritical) tags.push('`critical`');
    if (f.isConfig) tags.push('`config`');
    const changeStr = `+${f.additions} / -${f.deletions}`;
    return `| \`${f.path}\` | ${changeStr} | ${tags.join(' ')} |`;
  });

  return [
    '',
    '### 📂 Highlighted Risk Files',
    '',
    '| File | Changes | Tags |',
    '|------|---------|------|',
    ...rows,
    '',
  ].join('\n');
}

/**
 * Formats the list of checks that PASSED (did not trigger risk).
 */
function formatPassedChecks(passedRules: TriggeredRule[]): string {
  if (passedRules.length === 0) return '';

  const shown = passedRules.slice(0, MAX_PASSED_SHOWN);
  const items = shown.map((r: TriggeredRule) => `- ✅ ${r.label}`).join('\n');

  return [
    '',
    '<details>',
    '<summary>✅ Checks that passed</summary>',
    '',
    items,
    '',
    '</details>',
    '',
  ].join('\n');
}

/**
 * Formats the qualitative LLM insights into descriptive paragraphs.
 */
function formatLlmInsights(analysis: LlmAnalysis | null): string {
  if (!analysis) return '';

  return [
    '',
    '### 🤖 AI Qualitative Review',
    '',
    '> _Direct technical audit performed by local LLM._',
    '',
    '#### 🚨 Critical Security Audit',
    analysis.security,
    '',
    '#### 🧱 Architecture & Logic Flaws',
    analysis.logic,
    '',
    '#### 📉 Performance & Technical Debt',
    analysis.optimization,
    '',
    '#### 🧹 Clean Code & Maintainability Violations',
    analysis.deadCode,
    '',
    '#### 📝 Executive Summary',
    analysis.summary,
    '',
    '---',
  ].join('\n');
}

/**
 * Builds the full Markdown PR comment from scoring results and raw PR data.
 */
export function formatComment(
  result: ScoringResult, 
  prData: PrData, 
  delta: Delta | null = null,
  llmAnalysis: LlmAnalysis | null = null
): string {
  const {
    totalScore,
    maxScore,
    confidenceScore,
    riskLevel,
    riskEmoji,
    recommendation,
    triggeredRules,
    passedRules,
  } = result;

  const scoreBar = renderScoreBar(totalScore, maxScore);
  const badge = formatRiskBadge(riskLevel, riskEmoji);

  // ── Header ────────────────────────────────────────────────────────────────
  const header = [
    '## 🚦 PR Risk Analysis',
    '',
    '> Automated risk assessment combining **deterministic rules** and **qualitative AI review**.',
    '',
  ].join('\n');

  // ── AI Insights (Promoted to Top) ─────────────────────────────────────────
  const aiSection = formatLlmInsights(llmAnalysis);

  // ── Risk Summary Card ─────────────────────────────────────────────────────
  let trendSection = '';
  if (delta) {
    const trendIcon = delta.trend === 'improved' ? '🔽' : delta.trend === 'worsened' ? '🔼' : '➡️';
    const trendText = delta.trend === 'improved' ? 'Reduced' : delta.trend === 'worsened' ? 'Increased' : 'Unchanged';
    trendSection = `| 📈 Risk Trend | ${trendIcon} **${trendText}** (was ${delta.previousScore}) |\n`;
  }

  const summary = [
    '---',
    '',
    `### Risk Level: ${badge}`,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| 🎯 Risk Score | **${totalScore}** / 100 |`,
    `| 📊 Impact Meter | \`${scoreBar}\` ${totalScore}% |`,
    trendSection.trim(),
    `| 📁 Files Changed | ${prData.fileCount} |`,
    `| 📝 Lines Changed | +${prData.totalAdditions} / -${prData.totalDeletions} (${prData.totalChanges} total) |`,
    '',
  ].filter(Boolean).join('\n');

  // ── Improvements & New Risks ──────────────────────────────────────────────
  let evolutionSection = '';
  if (delta) {
    const improvements = delta.improved.map((r: { label: string }) => `- ✅ **${r.label}** (Fixed)`).join('\n');
    const newRisks = delta.newRisks.map((r: { label: string }) => `- ⚠️ **${r.label}** (Added)`).join('\n');

    if (improvements || newRisks) {
      evolutionSection = [
        '### 🔄 Changes since last push',
        '',
        improvements ? `#### ✅ Improvements detected:\n${improvements}\n` : '',
        newRisks ? `#### ⚠️ New risks introduced:\n${newRisks}\n` : '',
        '',
      ].filter(Boolean).join('\n');
    }
  }

  // ── Risk Reasons ──────────────────────────────────────────────────────────
  let reasons = '';
  if (triggeredRules.length > 0) {
    const bullets = triggeredRules
      .map((r: TriggeredRule) => {
        const detail = r.detail ? `\n  > _${r.detail}_` : '';
        return `- ⚡ **${r.label}** \`+${r.points} pts\`${detail}`;
      })
      .join('\n');

    reasons = [
      '### ⚠️ Why this PR is risky',
      '',
      bullets,
      '',
    ].join('\n');
  } else {
    reasons = [
      '### ✅ No risk factors detected',
      '',
      'This PR passed all risk checks. Great work keeping the change focused!',
      '',
    ].join('\n');
  }

  // ── Risky Files Table ─────────────────────────────────────────────────────
  const riskyFilesSection = formatRiskyFiles(prData.fileDetails);

  // ── Passed Checks (collapsed) ─────────────────────────────────────────────
  const passedSection = formatPassedChecks(passedRules);

  // ── Recommendation ────────────────────────────────────────────────────────
  const recommendationSection = [
    '---',
    '',
    '### 💡 Recommendation',
    '',
    recommendation,
    '',
  ].join('\n');

  // ── Developer Tip ─────────────────────────────────────────────────────────
  const tipSection = [
    '---',
    '',
    '> 💡 **Tip:** Push changes to reduce risk — this analysis will automatically update.',
    '',
  ].join('\n');

  // ── Footer ────────────────────────────────────────────────────────────────
  const dataMarker = buildDataMarker(result);
  const aiStatus = llmAnalysis ? '' : ' · ⚠️ AI review skipped';
  const footer = [
    '---',
    '',
    '<sub>🤖 Generated by <strong>PR Risk Analyzer</strong> · ',
    `Deterministic scoring + Local AI review (Phi-3)${aiStatus} · `,
    `Analysis run: ${new Date().toUTCString()}</sub>`,
    '',
    dataMarker,
  ].join('');

  return [
    header,
    aiSection,
    summary,
    evolutionSection,
    reasons,
    riskyFilesSection,
    passedSection,
    recommendationSection,
    tipSection,
    footer,
  ].join('\n');
}
