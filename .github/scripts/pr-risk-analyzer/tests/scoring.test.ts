/**
 * tests/scoring.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the risk scoring engine.
 */

'use strict';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scorePr, TriggeredRule } from '../lib/scorer.js';
import { PrData } from '../lib/scoring-rules.js';

// ─── Helper: Build minimal PrData ────────────────────────────────────────────
function makePrData(overrides: Partial<PrData> = {}): PrData {
  return {
    totalChanges: 0,
    totalAdditions: 0,
    totalDeletions: 0,
    fileCount: 1,
    filePaths: ['src/app.js'],
    hasTestChanges: true,
    filesDeleted: false,
    testsDeleted: false,
    onlyTestsChanged: false,
    matchedCriticalPrefixes: [],
    criticalPaths: [],
    configFiles: [],
    fileDetails: [],
    ...overrides,
  };
}

describe('scorePr() — Tiered Rules', () => {
  test('diff size: >500 lines (+30)', () => {
    const res = scorePr(makePrData({ totalChanges: 600 }));
    assert.equal(res.rawScore, 30);
    assert.ok(res.triggeredRules.some((r: any) => r.id === 'large-diff-500'));
  });

  test('diff size: 200-500 lines (+20)', () => {
    const res = scorePr(makePrData({ totalChanges: 300 }));
    assert.equal(res.rawScore, 20);
    assert.ok(res.triggeredRules.some((r: any) => r.id === 'medium-diff-200'));
  });

  test('file count: >15 files (+20)', () => {
    const res = scorePr(makePrData({ fileCount: 20 }));
    assert.equal(res.rawScore, 20);
    assert.ok(res.triggeredRules.some((r: any) => r.id === 'high-file-count-15'));
  });

  test('file count: 5-15 files (+10)', () => {
    const res = scorePr(makePrData({ fileCount: 10 }));
    assert.equal(res.rawScore, 10);
    assert.ok(res.triggeredRules.some((r: any) => r.id === 'medium-file-count-5'));
  });
});

describe('scorePr() — Cumulative Service Impact', () => {
  test('single match: /payment (+40)', () => {
    const res = scorePr(makePrData({ matchedCriticalPrefixes: ['/payment'] }));
    assert.equal(res.rawScore, 40);
  });

  test('multi-match: /payment + /auth (+75)', () => {
    const res = scorePr(makePrData({ matchedCriticalPrefixes: ['/payment', '/auth'] }));
    assert.equal(res.rawScore, 75);
  });

  test('triple match: /payment + /auth + /config (+100)', () => {
    const res = scorePr(makePrData({ matchedCriticalPrefixes: ['/payment', '/auth', '/config'] }));
    assert.equal(res.rawScore, 100);
  });
});

describe('scorePr() — Change Type Risks', () => {
  test('file deletion (+25)', () => {
    const res = scorePr(makePrData({ filesDeleted: true }));
    assert.equal(res.rawScore, 25);
  });

  test('config modification (+20)', () => {
    const res = scorePr(makePrData({ configFiles: ['package.json'] }));
    assert.equal(res.rawScore, 20);
  });
});

describe('scorePr() — Test Intelligence', () => {
  test('tests removed (+30)', () => {
    const res = scorePr(makePrData({ testsDeleted: true }));
    assert.equal(res.rawScore, 30);
  });

  test('large PR (>200) with NO tests (+20)', () => {
    const res = scorePr(makePrData({ totalChanges: 250, hasTestChanges: false }));
    assert.equal(res.rawScore, 40); // 20 (medium-diff) + 20 (large-pr-no-tests)
  });

  test('strictly testing changes (-10)', () => {
    const res = scorePr(makePrData({ onlyTestsChanged: true }));
    assert.equal(res.rawScore, -10);
  });
});

describe('scorePr() — Threshold Mapping (0-100 scale)', () => {
  test('score < 20 should be LOW', () => {
    const res = scorePr(makePrData({ fileCount: 1 })); // Very few points
    assert.ok(res.totalScore <= 20);
    assert.equal(res.riskLevel, 'LOW');
  });

  test('score 21-60 should be MEDIUM', () => {
    // Manually trigger enough points to hit medium (e.g., payment + auth = 75 raw points)
    // 75 / 295 * 100 ≈ 25
    const res = scorePr(makePrData({ matchedCriticalPrefixes: ['/payment', '/auth'] }));
    assert.ok(res.totalScore > 20 && res.totalScore <= 60);
    assert.equal(res.riskLevel, 'MEDIUM');
  });

  test('score 61-100 should be HIGH', () => {
    // Trigger almost everything to hit HIGH
    const res = scorePr(makePrData({ 
        totalChanges: 600, 
        fileCount: 20, 
        matchedCriticalPrefixes: ['/payment', '/auth', '/config'],
        testsDeleted: true 
    }));
    assert.ok(res.totalScore > 60);
    assert.equal(res.riskLevel, 'HIGH');
  });
});
