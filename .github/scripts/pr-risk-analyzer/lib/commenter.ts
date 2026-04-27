/**
 * commenter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Interacts with the GitHub Issues API to find, post, or update comments.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { Octokit } from '@octokit/rest';

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
export { fetchHeadCommitSha } from './review-poster.js';