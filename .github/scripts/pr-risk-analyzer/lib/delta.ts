/**
 * delta.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes changes in risk between the current PR state and the previous analysis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { ScoringResult, TriggeredRule } from './scorer.js';

const DATA_SENTINEL = '<!-- pr-risk-data:';

export interface PreviousResult {
  score: number;
  level: string;
  ruleIds: string[];
}

export interface Delta {
  trend: 'improved' | 'worsened' | 'unchanged';
  scoreChange: number;
  previousScore: number;
  improved: { id: string; label: string }[];
  newRisks: { id: string; label: string }[];
}

/**
 * Extracts the hidden JSON data marker from a PR comment body.
 */
export function parsePreviousResult(commentBody: string | null): PreviousResult | null {
  if (!commentBody) return null;

  const startIdx = commentBody.indexOf(DATA_SENTINEL);
  if (startIdx === -1) return null;

  const endIdx = commentBody.indexOf(' -->', startIdx);
  if (endIdx === -1) return null;

  const jsonStr = commentBody.substring(startIdx + DATA_SENTINEL.length, endIdx);
  try {
    const data = JSON.parse(jsonStr);
    if (typeof data.score === 'number' && data.level && Array.isArray(data.ruleIds)) {
      return data as PreviousResult;
    }
  } catch (err) {
    console.warn('[PR Risk Analyzer] ⚠️ Failed to parse previous data marker.');
  }

  return null;
}

/**
 * Formats a hidden JSON marker to persist current analysis state.
 */
export function buildDataMarker(result: ScoringResult): string {
  const data = {
    score: result.totalScore,
    level: result.riskLevel,
    ruleIds: result.triggeredRules.map((r: TriggeredRule) => r.id),
  };
  return `${DATA_SENTINEL}${JSON.stringify(data)} -->`;
}

/**
 * Computes the delta (trend and specific fixed/added risks).
 */
export function computeDelta(current: ScoringResult, previous: PreviousResult | null): Delta | null {
  if (!previous) return null;

  const scoreChange = current.totalScore - previous.score;
  const trend = scoreChange < 0 ? 'improved' : scoreChange > 0 ? 'worsened' : 'unchanged';

  const currentRuleIds = current.triggeredRules.map((r: TriggeredRule) => r.id);
  
  // Improved: rules that were in previous but not in current
  const improvedIds = previous.ruleIds.filter((id: string) => !currentRuleIds.includes(id));
  // New Risks: rules that are in current but not in previous
  const newRiskIds = currentRuleIds.filter((id: string) => !previous.ruleIds.includes(id));

  // Note: We only have labels for current rules from current.triggeredRules or passedRules.
  // For previous rules, we search SCORING_RULES or just reuse labels if they match.
  const allRules = [...current.triggeredRules, ...current.passedRules];
  
  const improved = improvedIds.map((id: string) => {
    const rule = allRules.find((r: TriggeredRule) => r.id === id);
    return { id, label: rule?.label || id };
  });

  const newRisks = newRiskIds.map((id: string) => {
    const rule = current.triggeredRules.find((r: TriggeredRule) => r.id === id);
    return { id, label: rule?.label || id };
  });

  return {
    trend,
    scoreChange,
    previousScore: previous.score,
    improved,
    newRisks,
  };
}
