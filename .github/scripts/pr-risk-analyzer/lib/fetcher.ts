/**
 * fetcher.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsible for fetching PR metadata from the GitHub API via @octokit/rest.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { Octokit } from '@octokit/rest';
import { PrData, FileDetail } from './scoring-rules.js';

// ─── Critical Path Patterns ───────────────────────────────────────────────────
const CRITICAL_PATH_KEYWORDS = [
  'auth', 'authentication', 'authorization', 'login', 'oauth', 'token',
  'payment', 'billing', 'checkout', 'transaction', 'config', 'configuration',
  'core', 'controller', 'services', 'infrastructure', 'infra', 'security',
  'secrets', 'credentials', 'middleware', 'gateway',
];

// ─── Config / Dependency File Patterns ───────────────────────────────────────
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
  /^(app|web|server|main)\.(config|settings)\.(js|ts|json|yaml|yml)$/i,
  /^(tsconfig|jsconfig|babel\.config|jest\.config)\.(js|ts|json)$/i,
  /^(terraform|pulumi|ansible|kubernetes|k8s).*\.(ya?ml|tf|json)$/i,
];

// ─── Test File Patterns ───────────────────────────────────────────────────────
const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.(js|ts|jsx|tsx|py|rb|go|java|kt|rs)$/i,
  /__(tests?|specs?)__\//i,
  /\/tests?\//i,
  /\/spec\//i,
  /\/e2e\//i,
  /\/integration\//i,
  /\.(test|spec)$/i,
];

export interface FetchParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
}

/**
 * Fetches and normalizes PR data into a structured PrData object.
 */
export async function fetchPrData({ token, owner, repo, prNumber }: FetchParams): Promise<PrData> {
  const octokit = new Octokit({ auth: token });

  // Paginate to ensure we get ALL changed files
  const files = await octokit.paginate(
    octokit.pulls.listFiles,
    { owner, repo, pull_number: prNumber, per_page: 100 },
    (response) => response.data,
  );

  // Fetch raw diff content for qualitative LLM analysis
  let fullDiff = '';
  try {
    const { data: diffData } = (await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner,
      repo,
      pull_number: prNumber,
      headers: { accept: 'application/vnd.github.v3.diff' },
    })) as unknown as { data: string };
    fullDiff = diffData;
  } catch (err: any) {
    console.warn(`[PR Risk Analyzer] ⚠️ Could not fetch raw diff: ${err.message}`);
  }

  const totalChanges = files.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  const filePaths = files.map((f) => f.filename);
  const fileCount = filePaths.length;

  // ── Classify files ──────────────────────────────────────────────────────
  const isTestFile = (path: string) => TEST_FILE_PATTERNS.some((pattern) => pattern.test(path));

  const hasTestChanges = filePaths.some(isTestFile);
  const filesDeleted = files.some((f) => f.status === 'removed');
  const testsDeleted = files.some((f) => f.status === 'removed' && isTestFile(f.filename));
  const onlyTestsChanged = files.length > 0 && files.every((f) => isTestFile(f.filename));

  const matchedCriticalPrefixes = new Set<string>();
  filePaths.forEach((path) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (normalizedPath.startsWith('/payment')) matchedCriticalPrefixes.add('/payment');
    if (normalizedPath.startsWith('/auth'))    matchedCriticalPrefixes.add('/auth');
    if (normalizedPath.startsWith('/config'))  matchedCriticalPrefixes.add('/config');
  });

  const criticalPaths = filePaths.filter((path) => {
    const lower = path.toLowerCase();
    return CRITICAL_PATH_KEYWORDS.some((keyword) => lower.includes(keyword));
  });

  const configFiles = filePaths.filter((path) => {
    const filename = path.split('/').pop() || ''; 
    return CONFIG_FILE_PATTERNS.some((pattern) => pattern.test(filename));
  });

  const fileDetails: FileDetail[] = files.map((f) => ({
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.additions + f.deletions,
    status: f.status,
    isCritical: criticalPaths.includes(f.filename),
    isConfig: configFiles.includes(f.filename),
    isTest: isTestFile(f.filename),
  }));

  return {
    totalChanges,
    fileCount,
    filePaths,
    hasTestChanges,
    filesDeleted,
    testsDeleted,
    onlyTestsChanged,
    matchedCriticalPrefixes: Array.from(matchedCriticalPrefixes),
    criticalPaths,
    configFiles,
    fileDetails,
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
    fullDiff,
  };
}
