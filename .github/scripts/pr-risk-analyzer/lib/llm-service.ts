/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `You are a senior software engineer and security auditor. 
Analyze the provided code diff and provide a structured analysis.
Prioritize your findings in these categories:
1. DATA SECURITY: Credential leaks, insecure storage, unvalidated inputs.
2. LOGICAL BUGS: Race conditions, edge cases, off-by-one errors.
3. OPTIMIZATION: Suggestions for more efficient or idiomatic code.
4. DEAD CODE: Unused logic, obsolete imports, or redundant branches.
5. MAINTAINABILITY: Complexity, readability, and consistency.

Always provide a final SUMMARY of the overall quality.
Format your response as a simple JSON object with these keys: 
"security", "logic", "optimization", "deadCode", "maintainability", "summary".
Keep descriptions concise but actionable. Use Markdown for code snippets.`;

const MAX_DIFF_LENGTH = 20000; // Truncate extremely large diffs

export interface LlmConfig {
  endpoint: string;
  model: string;
}

/**
 * Communicates with a local LLM to get qualitative insights.
 */
export async function analyzePrDiff(diff: string, config: LlmConfig): Promise<LlmAnalysis | null> {
  if (!diff || !config.endpoint) return null;

  const truncatedDiff = diff.length > MAX_DIFF_LENGTH 
    ? diff.substring(0, MAX_DIFF_LENGTH) + '\n\n[... Diff truncated for context limits ...]' 
    : diff;

  try {
    console.log(`[PR Risk Analyzer] 🤖 Querying local LLM (${config.model}) at ${config.endpoint}...`);

    const response = await fetch(`${config.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyze this PR diff:\n\n${truncatedDiff}` }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API returned ${response.status}: ${await response.text()}`);
    }

    const data: any = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) return null;

    try {
      const parsed = JSON.parse(content);

      // Coerce any field to a plain string — LLMs sometimes return nested objects or arrays
      const ensureString = (val: any, fallback: string): string => {
        if (!val) return fallback;
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return val.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
        if (typeof val === 'object') return Object.values(val).map(v => String(v)).join('\n');
        return String(val);
      };

      return {
        security:        ensureString(parsed.security,        'No significant security concerns detected.'),
        logic:           ensureString(parsed.logic,           'Logic appears sound.'),
        optimization:    ensureString(parsed.optimization,    'No immediate optimizations suggested.'),
        deadCode:        ensureString(parsed.deadCode,        'No dead code identified.'),
        maintainability: ensureString(parsed.maintainability, 'Code is maintainable.'),
        summary:         ensureString(parsed.summary,         'Summary not available.'),
        raw: content
      };
    } catch (parseErr) {
      console.warn('[PR Risk Analyzer] ⚠️ LLM returned non-JSON. Falling back to raw summary.');
      return {
        security: 'See summary.',
        logic: 'See summary.',
        optimization: 'See summary.',
        deadCode: 'See summary.',
        maintainability: 'See summary.',
        summary: content,
        raw: content
      };
    }
  } catch (err: any) {
    console.warn(`[PR Risk Analyzer] 🤖 LLM Analysis failed: ${err.message}`);
    return null;
  }
}
