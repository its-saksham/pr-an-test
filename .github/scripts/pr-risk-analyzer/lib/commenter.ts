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
const INLINE_COMMENT_SIGNATURE = '<!-- pr-risk-analyzer-inline-bot -->';

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

  const extractFromLocator = (locator: string | undefined, fieldName: string, body: string, suggestion?: string): void => {
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
      
      let finalBody = body;
      if (suggestion && suggestion.trim()) {
        finalBody = `${body}\n\n${suggestion}`;
      }
      
      comments.push({ path, line, body: finalBody });
    } else {
      console.warn(`[PR Risk Analyzer] ⚠️ Invalid ${fieldName} LOCATOR format: ${locator}`);
    }
  };

  extractFromLocator(analysis.securityLocator, 'security', analysis.security, analysis.securitySuggestion);
  extractFromLocator(analysis.logicLocator, 'logic', analysis.logic, analysis.logicSuggestion);

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

  const octokit = new Octokit({ auth: token });

  // ── Fetch existing inline comments to avoid duplicates ───────────────────
  console.log('[PR Risk Analyzer] 🔍 Checking for existing inline comments...');
  const existingInlineComments: any[] = [];
  try {
    for await (const { data: reviewComments } of octokit.paginate.iterator(
      octokit.pulls.listReviewComments,
      { owner, repo, pull_number: prNumber }
    )) {
      existingInlineComments.push(...reviewComments.filter((c: any) => c.body?.includes(INLINE_COMMENT_SIGNATURE)));
    }
    console.log(`[PR Risk Analyzer] 📊 Found ${existingInlineComments.length} existing bot inline comment(s).`);
  } catch (err: any) {
    console.warn('[PR Risk Analyzer] ⚠️ Could not fetch existing inline comments:', err.message);
  }

  // Find diff positions for each comment and filter out duplicates
  const reviewComments = [];
  for (const comment of comments) {
    const signedBody = `${INLINE_COMMENT_SIGNATURE}\n${comment.body}`;
    
    // Check if this exact comment already exists
    const isDuplicate = existingInlineComments.some(existing => 
      existing.path === comment.path && 
      existing.body.includes(comment.body)
    );

    if (isDuplicate) {
      console.log(`[PR Risk Analyzer] ⏭️ Skipping duplicate comment for ${comment.path}:${comment.line}`);
      continue;
    }

    console.log(`[PR Risk Analyzer] 🔍 Finding position for ${comment.path}:${comment.line}`);
    const position = findDiffPosition(diff, comment.path, comment.line);
    console.log(`[PR Risk Analyzer] 📍 Position found: ${position} for ${comment.path}:${comment.line}`);
    if (position !== null) {
      reviewComments.push({
        path: comment.path,
        position,
        body: signedBody,
      });
    } else {
      console.warn(`[PR Risk Analyzer] ⚠️ Could not find diff position for ${comment.path}:${comment.line}`);
    }
  }

  if (reviewComments.length === 0) {
    console.log('[PR Risk Analyzer] ℹ️ No new inline comments to post.');
    return;
  }

  console.log(`[PR Risk Analyzer] 📝 Creating review with ${reviewComments.length} new comment(s)...`);

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
 * Returns the position index as required by the GitHub PR Review API.
 * The 'position' is the index of the line in the diff, starting from 1 for the first line of the diff for that file.
 */
function findDiffPosition(diff: string, path: string, targetLine: number): number | null {
  const lines = diff.split('\n');
  let currentFile = '';
  let currentLineInFile = 0;
  let fileDiffPosition = 0;
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git')) {
      const match = line.match(/ b\/(.+)$/);
      currentFile = match ? match[1] : '';
      fileDiffPosition = 0;
      if (found) break; // If we already found it for the previous file, we're done
    }

    if (currentFile !== path) continue;

    // We are in the file we care about. 
    // Every line in the diff for this file (hunk headers, +, -, context) increments the position.
    // Except for the 'diff --git', 'index', '---', and '+++' lines.
    if (line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    fileDiffPosition++;

    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLineInFile = parseInt(match[1], 10);
      }
    } else if (line.startsWith('+')) {
      if (currentLineInFile === targetLine) return fileDiffPosition;
      currentLineInFile++;
    } else if (line.startsWith('-')) {
      // Deletions don't increment the current line counter for the NEW file
    } else if (line.startsWith(' ')) {
      if (currentLineInFile === targetLine) return fileDiffPosition;
      currentLineInFile++;
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
