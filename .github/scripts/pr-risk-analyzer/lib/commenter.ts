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
 * Posts a new comment or updates an existing one (idempotent).
 */
export async function postOrUpdateComment({ token, owner, repo, prNumber, body }: Required<CommentParams>): Promise<PostResult> {
  const octokit = new Octokit({ auth: token });

  // Append invisible signature so we can identify our bot's comment later
  const signedBody = `${COMMENT_SIGNATURE}\n${body}`;

  // ── Search for existing bot comment ───────────────────────────────────────
  const existingComment = await findExistingComment({ token, owner, repo, prNumber });

  // ── Create or update ──────────────────────────────────────────────────────
  if (existingComment) {
    const { data } = await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body: signedBody,
    });
    return { action: 'updated', commentUrl: (data as any).html_url };
  } else {
    const { data } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: signedBody,
    });
    return { action: 'created', commentUrl: (data as any).html_url };
  }
}
