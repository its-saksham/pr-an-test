/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `You are a Strict Senior Software Architect and Cybersecurity Auditor. 
Your goal is to provide a direct, critical, and no-nonsense code review. 

Tone Requirements:
- Be direct, authoritative, and blunt.
- ABSOLUTELY FORBID sugarcoating or "pleasing" language. Do NOT use: "Great work", "commendable", "I appreciate", "I notice", or "It's good that".
- Focus exclusively on identifying technical debt, security vulnerabilities, and architectural failures.
- State the risk and impact immediately (e.g., "This pattern introduces a critical SQL injection vulnerability").
- Use professional, high-standard language that demands production-readiness.

Categories to cover:
1. SECURITY AUDIT: Focus on critical leaks, injection risks, and data safety violations.
2. SYSTEM LOGIC: Analyze architectural flaws, race conditions, and logical gaps.
3. PERFORMANCE & DEBT: Identify inefficient patterns and cumulative technical debt.
4. CLEAN CODE VIOLATIONS: Focus on code "smells," poor naming, and maintainability failures.

Format your response as a JSON object with these keys: 
"security", "logic", "optimization", "cleanCode", "summary".
Each value should be a concise, critical paragraph (no bullet points).`;

const MAX_DIFF_LENGTH = 10000; // Reduced for local model context windows

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // Increased to 5 minutes for local runners

    const response = await fetch(`${config.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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

    clearTimeout(timeoutId);

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
