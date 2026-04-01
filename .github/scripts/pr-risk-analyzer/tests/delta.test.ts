/**
 * tests/delta.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the risk evolution / delta analysis module.
 */

'use strict';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreviousResult, computeDelta, Delta } from '../lib/delta.js';
import { ScoringResult, TriggeredRule } from '../lib/scorer.js';

describe('parsePreviousResult()', () => {
  test('returns null for an empty or undefined body', () => {
    assert.equal(parsePreviousResult(null), null);
    assert.equal(parsePreviousResult(''), null);
  });

  test('returns null when no data marker is present', () => {
    assert.equal(parsePreviousResult('## PR Risk Analysis\nLine 1\nLine 2'), null);
  });

  test('parses a valid hidden data marker', () => {
    const body = 'Some analysis stuff here.\n<!-- pr-risk-data:{"score":45,"level":"MEDIUM","ruleIds":["large-diff"]} -->';
    const result = parsePreviousResult(body);
    assert.notEqual(result, null);
    assert.equal(result?.score, 45);
    assert.equal(result?.level, 'MEDIUM');
    assert.deepEqual(result?.ruleIds, ['large-diff']);
  });
});

describe('computeDelta()', () => {
  const currentResult: Partial<ScoringResult> = {
    totalScore: 50,
    riskLevel: 'MEDIUM',
    triggeredRules: [
      { id: 'large-diff', label: 'Large diff', points: 20, detail: null },
      { id: 'many-files', label: 'Many files', points: 15, detail: null },
      { id: 'no-tests', label: 'No tests', points: 15, detail: null }
    ],
    passedRules: []
  };

  test('returns null if there is no previous data', () => {
    assert.equal(computeDelta(currentResult as ScoringResult, null), null);
  });

  test('detects an improved trend (score went down)', () => {
    const previous = { score: 70, level: 'HIGH', ruleIds: ['large-diff', 'many-files', 'critical-path'] };
    const delta = computeDelta(currentResult as ScoringResult, previous);
    assert.equal(delta?.trend, 'improved');
    assert.equal(delta?.scoreChange, -20);
    assert.ok(delta?.improved.some((r: any) => r.id === 'critical-path'));
  });
});
