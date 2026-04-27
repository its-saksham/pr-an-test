/**
 * locator-parser.ts
 * Parses LLM-generated LOCATOR tags into structured inline comment data.
 */

'use strict';

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

// Matches: LOCATOR: [src/auth/session.js:L42]
const LOCATOR_REGEX = /LOCATOR:\s*\[([^\]:]+):L(\d+)\]/g;

/**
 * Splits an LLM analysis field into segments, each bound to a locator.
 * Text before the first locator becomes a file-level comment (line 1).
 *
 * Example input:
 *   "Found session hijacking risk.\nLOCATOR: [src/auth/session.js:L42]\nAlso weak token.\nLOCATOR: [src/auth/token.js:L10]"
 *
 * Returns:
 *   [
 *     { path: "src/auth/session.js", line: 42, body: "Found session hijacking risk." },
 *     { path: "src/auth/token.js",   line: 10, body: "Also weak token." }
 *   ]
 */
export function parseLocators(text: string): InlineComment[] {
  if (!text) return [];

  const results: InlineComment[] = [];

  // Split on every LOCATOR tag, keeping the tag in the result
  const parts = text.split(/(LOCATOR:\s*\[[^\]]+\])/);

  let pendingBody = '';

  for (const part of parts) {
    const locatorMatch = /LOCATOR:\s*\[([^\]:]+):L(\d+)\]/.exec(part);

    if (locatorMatch) {
      const path = locatorMatch[1].trim();
      const line = parseInt(locatorMatch[2], 10);
      const body = pendingBody.trim();

      if (body) {
        results.push({ path, line, body });
      }

      pendingBody = ''; // reset for next segment
    } else {
      // Accumulate text until we hit the next locator
      pendingBody += part;
    }
  }

  return results;
}

/**
 * Extracts all inline comments from a full LlmAnalysis object.
 * Merges findings from security, logic, optimization, and deadCode fields.
 */
export function extractInlineComments(analysis: {
  security: string;
  logic: string;
  optimization: string;
  deadCode: string;
}): InlineComment[] {
  const sections: { label: string; text: string }[] = [
    { label: '🔐 Security',     text: analysis.security },
    { label: '🧱 Logic',        text: analysis.logic },
    { label: '📉 Optimization', text: analysis.optimization },
    { label: '🧹 Clean Code',   text: analysis.deadCode },
  ];

  const allComments: InlineComment[] = [];

  for (const { label, text } of sections) {
    const parsed = parseLocators(text);

    for (const comment of parsed) {
      allComments.push({
        ...comment,
        // Prefix body with section label for reviewer clarity
        body: `**${label}**\n\n${comment.body}`,
      });
    }
  }

  return allComments;
}