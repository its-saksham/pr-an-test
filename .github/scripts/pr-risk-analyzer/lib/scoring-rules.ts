/**
 * scoring-rules.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Configuration-driven rule definitions for the PR risk scoring engine.
 *
 * This file contains all the interfaces and logic for defining risk factors.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/**
 * Normalized PR metadata for scoring evaluation.
 */
export interface PrData {
  totalChanges: number;
  totalAdditions: number;
  totalDeletions: number;
  fileCount: number;
  filePaths: string[];
  hasTestChanges: boolean;
  filesDeleted: boolean;
  testsDeleted: boolean;
  onlyTestsChanged: boolean;
  matchedCriticalPrefixes: string[];
  criticalPaths: string[];
  configFiles: string[];
  fileDetails: FileDetail[];
  fullDiff?: string; // Optional full raw diff for qualitative LLM analysis
}

export interface LlmAnalysis {
  riskScore: number;     // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  security: string;
  logic: string;
  optimization: string;
  cleanCode: string;
  summary: string;
  raw?: string;
}

export interface FileDetail {
  path: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string; // 'added' | 'modified' | 'removed' | 'renamed'
  isCritical: boolean;
  isImportant: boolean; // For /src/ importance
  isConfig: boolean;
  isTest: boolean;
}

/**
 * Definition for a deterministic scoring rule.
 */
export interface ScoringRule {
  id: string;
  label: string;
  points: number;
  evaluate: (data: PrData) => boolean;
  getDetail?: (data: PrData) => string;
}

/**
 * Threhold for mapping scores to a risk level.
 */
export interface RiskThreshold {
  min: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  emoji: string;
  color: string;
  recommendation: string;
}

// ─── Rule Definitions ────────────────────────────────────────────────────────

/** @type {ScoringRule[]} */
export const SCORING_RULES: ScoringRule[] = [
  // ── 1. Diff Size (Change Volume) ──────────────────────────────────────────
  {
    id: 'large-diff-500',
    label: 'Massive diff (>500 lines)',
    points: 30,
    evaluate: ({ totalChanges }) => totalChanges > 500,
    getDetail: ({ totalChanges }) => `${totalChanges} lines changed`,
  },
  {
    id: 'medium-diff-200',
    label: 'Medium diff (200-500 lines)',
    points: 20,
    evaluate: ({ totalChanges }) => totalChanges > 200 && totalChanges <= 500,
    getDetail: ({ totalChanges }) => `${totalChanges} lines changed`,
  },

  // ── 2. File Count (Change Spread) ──────────────────────────────────────────
  {
    id: 'high-file-count-15',
    label: 'High number of files (>15)',
    points: 20,
    evaluate: ({ fileCount }) => fileCount > 15,
    getDetail: ({ fileCount }) => `${fileCount} files changed`,
  },
  {
    id: 'medium-file-count-5',
    label: 'Medium number of files (5-15)',
    points: 10,
    evaluate: ({ fileCount }) => fileCount >= 5 && fileCount <= 15,
    getDetail: ({ fileCount }) => `${fileCount} files changed`,
  },

  // ── 3. Critical Service Impact (Cumulative) ──────────────────────────────
  {
    id: 'critical-impact-payment',
    label: 'Critical module modified: /payment',
    points: 40,
    evaluate: ({ matchedCriticalPrefixes }) => matchedCriticalPrefixes.includes('/payment'),
  },
  {
    id: 'critical-impact-auth',
    label: 'Critical module modified: /auth',
    points: 35,
    evaluate: ({ matchedCriticalPrefixes }) => matchedCriticalPrefixes.includes('/auth'),
  },
  {
    id: 'critical-impact-config',
    label: 'Critical module modified: /config',
    points: 25,
    evaluate: ({ matchedCriticalPrefixes }) => matchedCriticalPrefixes.includes('/config'),
  },

  // ── 4. Change Type Risk ───────────────────────────────────────────────────
  {
    id: 'file-deletion',
    label: 'File deletion detected',
    points: 25,
    evaluate: ({ filesDeleted }) => filesDeleted,
  },
  {
    id: 'config-modification',
    label: 'Dependency or config file modified',
    points: 20,
    evaluate: ({ configFiles }) => configFiles.length > 0,
    getDetail: ({ configFiles }) =>
      `Files: ${configFiles.slice(0, 3).join(', ')}${configFiles.length > 3 ? ` (+${configFiles.length - 3} more)` : ''}`,
  },

  // ── 5. Test Intelligence ──────────────────────────────────────────────────
  {
    id: 'tests-removed',
    label: 'Tests removed',
    points: 30,
    evaluate: ({ testsDeleted }) => testsDeleted,
  },
  {
    id: 'large-pr-no-tests',
    label: 'No tests added in large PR (>200 lines)',
    points: 20,
    evaluate: ({ totalChanges, hasTestChanges }) => totalChanges > 200 && !hasTestChanges,
  },
  {
    id: 'only-test-changes',
    label: 'Strictly testing changes',
    points: -10, // Negative score (Reward)
    evaluate: ({ onlyTestsChanged }) => onlyTestsChanged,
  },
];

// ─── Risk Thresholds ─────────────────────────────────────────────────────────

export const RISK_THRESHOLDS: RiskThreshold[] = [
  {
    min: 61,
    level: 'HIGH',
    emoji: '🔴',
    color: '#d73a49',
    recommendation:
      '⚠️ **Requires careful review by a senior engineer.** Consider breaking this PR into smaller changes and ensuring adequate test coverage before merging.',
  },
  {
    min: 21,
    level: 'MEDIUM',
    emoji: '🟡',
    color: '#f0ad4e',
    recommendation:
      '🔍 **Peer review recommended.** Verify impact on downstream services and confirm tests cover the changed logic.',
  },
  {
    min: Number.NEGATIVE_INFINITY,
    level: 'LOW',
    emoji: '🟢',
    color: '#28a745',
    recommendation:
      '✅ **Looks good to review.** Standard review process applies — verify intent and correctness.',
  },
];
