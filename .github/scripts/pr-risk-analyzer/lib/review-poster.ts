/**
 * review-poster.ts
 * Posts inline PR review comments using the GitHub Pull Request Review API.
 */

'use strict';

import { Octokit } from '@octokit/rest';
import { InlineComment } from './locator-parser.js';

export interface ReviewParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  commitSha: string;
  comments: InlineComment[];
  summary: string; // Top-level review body (executive summary)
}

export interface ReviewResult {
  reviewId: number;
  reviewUrl: string;
  postedCount: number;
  skippedCount: number;
}

/**
 * Fetches the latest commit SHA on the PR head.
 * Inline comments MUST be anchored to a specific commit.
 */
export async function fetchHeadCommitSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
  return data.head.sha;
}

/**
 * Validates that a file path and line number exist in the PR diff.
 * GitHub rejects inline comments on lines not present in the diff.
 */
async function fetchDiffPositions(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<Map<string, Set<number>>> {
  const files = await octokit.paginate(
    octokit.pulls.listFiles,
    { owner, repo, pull_number: prNumber, per_page: 100 },
    (response) => response.data,
  );

  // Map of filepath -> Set of valid line numbers present in the diff
  const validLines = new Map<string, Set<number>>();

  for (const file of files) {
    const lines = new Set<number>();

    if (file.patch) {
      // Parse unified diff patch to extract valid line numbers
      let currentLine = 0;

      for (const patchLine of file.patch.split('\n')) {
        const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(patchLine);

        if (hunkHeader) {
          currentLine = parseInt(hunkHeader[1], 10) - 1;
          continue;
        }

        if (patchLine.startsWith('-')) {
          // Deleted line — not a valid target for inline comments
          continue;
        }

        currentLine++;

        if (patchLine.startsWith('+') || patchLine.startsWith(' ')) {
          lines.add(currentLine);
        }
      }
    }

    validLines.set(file.filename, lines);
  }

  return validLines;
}

/**
 * Posts a GitHub PR Review with inline comments.
 * Skips any comment whose file/line is not present in the diff.
 */
export async function postInlineReview({
  token,
  owner,
  repo,
  prNumber,
  commitSha,
  comments,
  summary,
}: ReviewParams): Promise<ReviewResult> {
  const octokit = new Octokit({ auth: token });

  // Validate which lines are actually in the diff
  const validLines = await fetchDiffPositions(octokit, owner, repo, prNumber);

  const validComments: { path: string; line: number; body: string }[] = [];
  let skippedCount = 0;

  for (const comment of comments) {
    const fileLines = validLines.get(comment.path);

    if (!fileLines) {
      console.warn(
        `[PR Risk Analyzer] ⚠️ Skipping inline comment — file not in diff: ${comment.path}`,
      );
      skippedCount++;
      continue;
    }

    if (!fileLines.has(comment.line)) {
      // Snap to nearest valid line in the same file as a fallback
      const nearest = findNearestLine(fileLines, comment.line);

      if (nearest === null) {
        console.warn(
          `[PR Risk Analyzer] ⚠️ Skipping inline comment — no valid lines in: ${comment.path}`,
        );
        skippedCount++;
        continue;
      }

      console.warn(
        `[PR Risk Analyzer] ⚠️ Line ${comment.line} not in diff for ${comment.path}, snapping to L${nearest}`,
      );

      validComments.push({ path: comment.path, line: nearest, body: comment.body });
    } else {
      validComments.push({ path: comment.path, line: comment.line, body: comment.body });
    }
  }

  // Post the review — COMMENT event leaves comments without approving/rejecting
  const { data } = await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitSha,
    body: summary,
    event: 'COMMENT',
    comments: validComments,
  });

  return {
    reviewId: data.id,
    reviewUrl: data.html_url,
    postedCount: validComments.length,
    skippedCount,
  };
}

/**
 * Finds the closest valid line number to the target within a set.
 */
function findNearestLine(validLines: Set<number>, target: number): number | null {
  if (validLines.size === 0) return null;

  let nearest: number | null = null;
  let minDistance = Infinity;

  for (const line of validLines) {
    const distance = Math.abs(line - target);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = line;
    }
  }

  return nearest;
}