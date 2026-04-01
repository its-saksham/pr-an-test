/**
 * tests/formatter.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the Markdown comment formatter.
 */

'use strict';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatComment, renderScoreBar } from '../lib/formatter.js';
import { scorePr } from '../lib/scorer.js';
import { PrData } from '../lib/scoring-rules.js';
import { Delta } from '../lib/delta.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

describe('renderScoreBar()', () => {
  test('returns a bar of the correct total width', () => {
    const bar = renderScoreBar(10, 100, 20);
    const content = bar.slice(1, -1);
    assert.equal(content.length, 20);
  });
});

describe('formatComment()', () => {
  test('includes basic elements (header, summary)', () => {
    const prData = makePrData();
    const result = scorePr(prData);
    const comment = formatComment(result, prData);
    assert.ok(comment.includes('🚦 PR Risk Analysis'));
    assert.ok(comment.includes('Risk Level:'));
    assert.ok(comment.includes('🎯 Risk Score'));
  });

  test('includes delta sections (trend, evolution)', () => {
    const prData = makePrData();
    const result = scorePr(prData);
    const delta: Delta = {
      trend: 'improved',
      scoreChange: -20,
      previousScore: 60,
      improved: [{ label: 'Critical module(s) modified', id: 'critical-path' }],
      newRisks: []
    };
    const comment = formatComment(result, prData, delta);
    assert.ok(comment.includes('Risk Trend'));
    assert.ok(comment.includes('Reduced'));
    assert.ok(comment.includes('Changes since last push'));
    assert.ok(comment.includes('Critical module(s) modified'));
  });

  test('includes a hidden data marker in the footer', () => {
    const prData = makePrData();
    const result = scorePr(prData);
    const comment = formatComment(result, prData);
    assert.ok(comment.includes('pr-risk-data:'));
  });

  test('includes the developer tip', () => {
    const prData = makePrData();
    const result = scorePr(prData);
    const comment = formatComment(result, prData);
    assert.ok(comment.includes('💡 **Tip:**'));
  });
});
