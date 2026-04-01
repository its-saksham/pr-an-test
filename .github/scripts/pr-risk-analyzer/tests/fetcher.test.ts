/**
 * tests/fetcher.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the file classification and path matching logic.
 */

'use strict';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// We mock the internals for regex testing
const CRITICAL_PATH_KEYWORDS = [
  'auth', 'authentication', 'authorization', 'login', 'oauth', 'token',
  'payment', 'billing', 'checkout', 'transaction',
  'config', 'configuration', 'core', 'infrastructure', 'infra',
  'security', 'secrets', 'credentials', 'middleware', 'gateway',
];

const CONFIG_FILE_PATTERNS = [
  /^package\.json$/i,
  /^package-lock\.json$/i,
  /^yarn\.lock$/i,
  /^pnpm-lock\.yaml$/i,
  /^requirements\.txt$/i,
  /^Pipfile(\.lock)?$/i,
  /^pyproject\.toml$/i,
  /^Gemfile(\.lock)?$/i,
  /^go\.mod$/i,
  /^go\.sum$/i,
  /^Cargo\.toml$/i,
  /^Cargo\.lock$/i,
  /\.env(\..+)?$/i,
  /^\.?docker(file|ignore)$/i,
  /^docker-compose.*\.ya?ml$/i,
  /^(tsconfig|jsconfig|babel\.config|jest\.config)\.(js|ts|json)$/i,
];

const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.(js|ts|jsx|tsx|py|rb|go|java|kt|rs)$/i,
  /__(tests?|specs?)__\//i,
  /\/tests?\//i,
  /\/spec\//i,
  /\/e2e\//i,
  /\/integration\//i,
];

function isCritical(path: string): boolean {
  const lower = path.toLowerCase();
  return CRITICAL_PATH_KEYWORDS.some((k) => lower.includes(k));
}

function isConfig(path: string): boolean {
  const filename = path.split('/').pop() || '';
  return CONFIG_FILE_PATTERNS.some((p) => p.test(filename));
}

function isTest(path: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(path));
}

function getMatchedCriticalPrefixes(paths: string[]): string[] {
  const matched = new Set<string>();
  paths.forEach((path) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (normalizedPath.startsWith('/payment')) matched.add('/payment');
    if (normalizedPath.startsWith('/auth'))    matched.add('/auth');
    if (normalizedPath.startsWith('/config'))  matched.add('/config');
  });
  return Array.from(matched);
}

// ─── Critical Path Detection ──────────────────────────────────────────────────
describe('Critical path detection', () => {
  test('detects auth paths', () => {
    assert.ok(isCritical('src/auth/login.ts'));
    assert.ok(isCritical('services/authentication/handler.js'));
  });

  test('detects payment paths', () => {
    assert.ok(isCritical('src/payment/checkout.js'));
    assert.ok(isCritical('modules/billing/invoice.ts'));
  });

  test('detects config paths', () => {
    assert.ok(isCritical('src/config/database.ts'));
    assert.ok(isCritical('infrastructure/terraform/main.tf'));
  });

  test('does not flag benign paths', () => {
    assert.ok(!isCritical('src/components/Button.tsx'));
    assert.ok(!isCritical('utils/formatDate.js'));
  });

  test('detects specific critical prefixes correctly', () => {
    const paths = ['payment/service.js', 'auth/helper.ts', 'config/main.yaml', 'other/file.txt'];
    const matched = getMatchedCriticalPrefixes(paths);
    assert.ok(matched.includes('/payment'));
    assert.ok(matched.includes('/auth'));
    assert.ok(matched.includes('/config'));
    assert.equal(matched.length, 3);
  });
});

// ─── Config File Detection ────────────────────────────────────────────────────
describe('Config file detection', () => {
  test('detects package.json', () => {
    assert.ok(isConfig('package.json'));
    assert.ok(isConfig('packages/ui/package.json'));
  });

  test('detects .env files', () => {
    assert.ok(isConfig('.env'));
    assert.ok(isConfig('.env.production'));
  });
});

// ─── Test File Detection ──────────────────────────────────────────────────────
describe('Test file detection', () => {
  test('detects .test.ts / .spec.ts files', () => {
    assert.ok(isTest('src/auth/login.test.ts'));
    assert.ok(isTest('lib/utils.spec.js'));
  });

  test('does not flag non-test source files', () => {
    assert.ok(!isTest('src/services/auth.ts'));
    assert.ok(!isTest('README.md'));
  });
});
