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
  totalScore: number;    // Normalized score (0-100)
  rawScore: number;      // Un-normalized sum of points
  maxScore: number;      // Always 100 for normalized
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

  const rawScore = triggeredRules.reduce((sum: number, r: TriggeredRule) => sum + r.points, 0);
  const maxPossiblePoints = SCORING_RULES.reduce((sum: number, r: any) => sum + r.points, 0);
  
  // Normalize score to 0-100 scale
  const riskScore = Math.max(0, Math.min(100, Math.round((rawScore / maxPossiblePoints) * 100)));

  // Determine risk level based on normalized 100-point scale
  const threshold = RISK_THRESHOLDS.find((t: RiskThreshold) => riskScore >= t.min) || RISK_THRESHOLDS[RISK_THRESHOLDS.length - 1];

  return {
    totalScore: riskScore, // Normalized 0-100
    rawScore,              // Original sum of points
    maxScore: 100,
    confidenceScore: riskScore,
    riskLevel: threshold.level,
    riskEmoji: threshold.emoji,
    recommendation: threshold.recommendation,
    triggeredRules,
    passedRules,
  };
}
