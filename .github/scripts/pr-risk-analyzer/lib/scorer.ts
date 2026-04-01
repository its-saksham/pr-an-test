/**
 * scorer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The deterministic risk scoring engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { PrData, SCORING_RULES, RISK_THRESHOLDS, RiskThreshold } from './scoring-rules.js';

export interface TriggeredRule {
  id: string;
  label: string;
  points: number;
  detail: string | null;
}

export interface ScoringResult {
  totalScore: number;
  maxScore: number;
  confidenceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskEmoji: string;
  recommendation: string;
  triggeredRules: TriggeredRule[];
  passedRules: TriggeredRule[];
}

/**
 * Evaluates all scoring rules against the PR data.
 */
export function scorePr(prData: PrData): ScoringResult {
  const triggeredRules: TriggeredRule[] = [];
  const passedRules: TriggeredRule[] = [];

  for (const rule of SCORING_RULES) {
    const fired = rule.evaluate(prData);

    const ruleResult: TriggeredRule = {
      id: rule.id,
      label: rule.label,
      points: rule.points,
      detail: fired && rule.getDetail ? rule.getDetail(prData) : null,
    };

    if (fired) {
      triggeredRules.push(ruleResult);
    } else {
      passedRules.push(ruleResult);
    }
  }

  const totalScore = triggeredRules.reduce((sum: number, r: TriggeredRule) => sum + r.points, 0);
  const maxScore = SCORING_RULES.reduce((sum: number, r: any) => sum + r.points, 0);
  const confidenceScore = Math.round((totalScore / maxScore) * 100);

  // Fallback to the first threshold (LOW) if none match (should not happen with Number.NEGATIVE_INFINITY)
  const threshold = RISK_THRESHOLDS.find((t: RiskThreshold) => totalScore >= t.min) || RISK_THRESHOLDS[RISK_THRESHOLDS.length - 1];

  return {
    totalScore,
    maxScore,
    confidenceScore,
    riskLevel: threshold.level,
    riskEmoji: threshold.emoji,
    recommendation: threshold.recommendation,
    triggeredRules,
    passedRules,
  };
}
