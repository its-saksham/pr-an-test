/**
 * commenter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Interacts with the GitHub Issues API to find, post, or update comments.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { Octokit } from '@octokit/rest';
import { LlmAnalysis } from './scoring-rules.js';

const COMMENT_SIGNATURE = '<!-- pr-risk-analyzer-bot -->';

export interface CommentParams {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  body?: string;
}

export interface PostResult {
  action: 'created' | 'updated';
  commentUrl: string;
}

export interface ExistingComment {
  id: number;
  body: string;
}

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

/**
 * Searches for an existing risk analyzer comment on the PR.
 */
export async function findExistingComment({ token, owner, repo, prNumber }: CommentParams): Promise<ExistingComment | null> {
  const octokit = new Octokit({ auth: token });

  for await (const { data: comments } of octokit.paginate.iterator(
    octokit.issues.listComments,
    { owner, repo, issue_number: prNumber, per_page: 100 },
  )) {
    const match = (comments as any[]).find((c) => c.body?.includes(COMMENT_SIGNATURE));
    if (match) {
      return { id: match.id, body: match.body };
    }
  }

  return null;
}

/**
 * Extracts inline comments from LLM analysis fields.
 */
export function extractInlineComments(analysis: LlmAnalysis): InlineComment[] {
  const comments: InlineComment[] = [];

  console.log(`[PR Risk Analyzer] 🔍 Extracting inline comments from LLM analysis...`);

  const extractFromLocator = (locator: string | undefined, fieldName: string, body: string): void => {
    if (!locator || !locator.trim()) {
      console.log(`[PR Risk Analyzer] ℹ️ No ${fieldName} LOCATOR provided`);
      return;
    }

    // Match: filename:5 or filename:L5 or filename:5-9 or filename:L5-9
    const pathLineMatch = locator.match(/^(.+):L?(\d+)(?:-\d+)?$/);
    if (pathLineMatch) {
      const path = pathLineMatch[1];
      const line = parseInt(pathLineMatch[2], 10);
      console.log(`[PR Risk Analyzer] ✅ Found ${fieldName} LOCATOR: ${path}:${line}`);
      comments.push({ path, line, body });
    } else {
      console.warn(`[PR Risk Analyzer] ⚠️ Invalid ${fieldName} LOCATOR format: ${locator}`);
    }
  };

  extractFromLocator(analysis.securityLocator, 'security', analysis.security);
  extractFromLocator(analysis.logicLocator, 'logic', analysis.logic);

  console.log(`[PR Risk Analyzer] 📊 Extracted ${comments.length} inline comment(s)`);
  return comments;
}

/**
 * Posts inline comments as a PR review.
 */
export async function postInlineComments({
  token,
  owner,
  repo,
  prNumber,
  commitId,
  comments,
  diff,
}: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  commitId: string;
  comments: InlineComment[];
  diff: string;
}): Promise<void> {
  if (comments.length === 0) {
    console.log('[PR Risk Analyzer] ℹ️ No inline comments to post.');
    return;
  }

  console.log(`[PR Risk Analyzer] 💬 Attempting to post ${comments.length} inline comment(s)...`);

  const octokit = new Octokit({ auth: token });

  // Find diff positions for each comment
  const reviewComments = [];
  for (const comment of comments) {
    console.log(`[PR Risk Analyzer] 🔍 Finding position for ${comment.path}:${comment.line}`);
    const position = findDiffPosition(diff, comment.path, comment.line);
    console.log(`[PR Risk Analyzer] 📍 Position found: ${position} for ${comment.path}:${comment.line}`);
    if (position !== null) {
      reviewComments.push({
        path: comment.path,
        position,
        body: comment.body,
      });
    } else {
      console.warn(`[PR Risk Analyzer] ⚠️ Could not find diff position for ${comment.path}:${comment.line}`);
    }
  }

  if (reviewComments.length === 0) {
    console.warn('[PR Risk Analyzer] ⚠️ No valid positions found for inline comments');
    return;
  }

  console.log(`[PR Risk Analyzer] 📝 Creating review with ${reviewComments.length} comment(s)...`);

  try {
    const review = await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitId,
      event: 'COMMENT',
      body: '',
      comments: reviewComments,
    });
    console.log(`[PR Risk Analyzer] ✅ Review created: ${review.data.html_url}`);
  } catch (err: any) {
    console.error(`[PR Risk Analyzer] ❌ Failed to create review: ${err.message}`);
    console.error('Review comments:', JSON.stringify(reviewComments, null, 2));
  }
}

/**
 * Finds the diff position for a given file and line number by parsing the unified diff.
 * Returns the position relative to the hunk header (1-based).
 */
function findDiffPosition(diff: string, path: string, targetLine: number): number | null {
  const lines = diff.split('\n');
  let currentFile = '';
  let inHunk = false;
  let hunkStartLine = 0;
  let positionInHunk = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git')) {
      // New file
      const match = line.match(/ b\/(.+)$/);
      currentFile = match ? match[1] : '';
      inHunk = false;
      positionInHunk = 0;
    } else if (line.startsWith('@@') && currentFile === path) {
      // New hunk for our file
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        hunkStartLine = parseInt(match[1], 10);
        inHunk = true;
        positionInHunk = 0; // Reset position counter for this hunk
      }
    } else if (inHunk && currentFile === path) {
      positionInHunk++;

      // Check if this is the target line
      if (line.startsWith('+')) {
        // Added line
        const currentLine = hunkStartLine + (positionInHunk - 1); // -1 because positionInHunk starts at 1 for the first line after @@
        if (currentLine === targetLine) {
          return positionInHunk;
        }
        hunkStartLine++; // Added lines increase the line counter
      } else if (line.startsWith('-')) {
        // Removed line - we can't comment on removed lines
        // But we still count the position
      } else if (line.startsWith(' ')) {
        // Context line
        const currentLine = hunkStartLine + (positionInHunk - 1);
        if (currentLine === targetLine) {
          return positionInHunk;
        }
        hunkStartLine++; // Context lines increase the line counter
      }
    }
  }

  return null;
}

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}


/**
 * Posts a new comment (always most recent).
 * If an existing bot comment is found, it is deleted before posting the new one.
 */
export async function postOrUpdateComment({ token, owner, repo, prNumber, body }: Required<CommentParams>): Promise<PostResult> {
  const octokit = new Octokit({ auth: token });

  // Append invisible signature so we can identify our bot's comment later
  const signedBody = `${COMMENT_SIGNATURE}\n${body}`;

  // ── Search for existing bot comment ───────────────────────────────────────
  const existingComment = await findExistingComment({ token, owner, repo, prNumber });

  // ── Clean up previous analysis if exists ──────────────────────────────────
  if (existingComment) {
    try {
      await octokit.issues.deleteComment({
        owner,
        repo,
        comment_id: existingComment.id,
      });
    } catch (err: any) {
      console.warn(`[PR Risk Analyzer] ⚠️ Could not delete old comment (ID: ${existingComment.id}):`, err.message);
    }
  }

  // ── Create fresh comment (stays at bottom of PR) ─────────────────────────
  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: signedBody,
  });

  return { 
    action: existingComment ? 'updated' : 'created', 
    commentUrl: (data as any).html_url 
  };
}
