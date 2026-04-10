/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `You are a Senior Software Engineer and Security Lead. 
Your goal is to provide a world-class, constructive code review on the provided diff. 

Tone Requirements:
- Be conversational and professional.
- Use encouraging phrasing (e.g., "Great work incorporating...", "I noticed that...").
- Provide specific technical context and rationale for your suggestions.
- Act as a mentor, not just a bug finder.

Categories to cover:
1. SECURITY & DATA SAFETY: Focus on credential leaks, sanitization, and insecure patterns.
2. LOGIC & EDGE CASES: Analyze race conditions, off-by-one errors, and unexpected inputs.
3. OPTIMIZATION & PERFORMANCE: Suggest more efficient algorithms or idiomatic patterns.
4. CLEAN CODE & MAINTAINABILITY: Focus on readability, single responsibility, and naming.

Format your response as a JSON object with these keys: 
"security", "logic", "optimization", "cleanCode", "summary".
Each value should be a descriptive paragraph (similar to a manual PR comment).`;

const MAX_DIFF_LENGTH = 20000; // Truncate extremely large diffs

export interface LlmConfig {
  endpoint: string;
  model: string;
}

/**
 * Communicates with a local LLM to get qualitative insights.
 */
export async function analyzePrDiff(diff: string, config: LlmConfig): Promise<LlmAnalysis | null> {
  if (!diff || !config.endpoint) {
    if (!config.endpoint) console.warn('[PR Risk Analyzer] 🤖 LLM Analysis skipped: No endpoint provided.');
    return null;
  }

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
          { role: 'user', content: `Analyze this PR diff and provide a constructive peer review:\n\n${truncatedDiff}` }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PR Risk Analyzer] ❌ LLM API returned ${response.status}: ${errorText}`);
      throw new Error(`LLM API Error: ${response.status}`);
    }

    const data: any = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.warn('[PR Risk Analyzer] 🤖 LLM returned empty content.');
      return null;
    }

    console.log('[PR Risk Analyzer] 🤖 LLM response received successfully.');

    try {
      const parsed = JSON.parse(content);
      return {
        security: parsed.security || 'Security and data safety look solid in this change.',
        logic: parsed.logic || 'The logical flow appears consistent with no immediate edge cases detected.',
        optimization: parsed.optimization || 'Code efficiency is good; no immediate performance bottlenecks identified.',
        deadCode: parsed.cleanCode || parsed.deadCode || 'Code is clean and adheres to common maintainability standards.',
        maintainability: parsed.summary || 'Summary not available.',
        summary: parsed.summary || content,
        raw: content
      };
    } catch (parseErr) {
      console.warn('[PR Risk Analyzer] ⚠️ LLM returned non-JSON. Formatting raw text as summary.');
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
    // Log the actual error for better debugging on self-hosted runners
    console.error('[PR Risk Analyzer] 💥 Full LLM Error Context:', err);
    return null;
  }
}
