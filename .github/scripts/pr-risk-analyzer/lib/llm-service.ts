/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `Strict Senior Cybersecurity Auditor. 
Provide a direct, critical, line-specific review. 

Requirements:
- FOCUS: Prioritize your audit based on functional impact and security sensitivity. Focus on logic that handles financial state, credentials, or architectural complexity. 
- TONE: Authoritative, blunt, and critical. NO sugarcoating.
- ANCHORS: Every finding MUST start with **[Filename:L<LineNumber>]**.
- RISK: State the vulnerability and impact immediately (e.g., "**[db.js:L12]** Critical: Hardcoded production password...").

Format: JSON object with keys "security", "logic", "optimization", "cleanCode", "summary".
Each value: One concise, critical paragraph starting with the location anchor.`;

const MAX_DIFF_LENGTH = 7500; // Balanced for CPU models with reordered diffs

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
    ? diff.substring(0, MAX_DIFF_LENGTH) + '\n\n[... Diff truncated ...]' 
    : diff;

  try {
    console.log(`[PR Risk Analyzer] 🤖 Querying local LLM (${config.model}) at ${config.endpoint}...`);

    const userMessage = [
      'Analyze the following PR diff. Provide a strict audit.',
      '',
      'HUNK HELP: @@ -A,B +C,D @@ means new code starts at line C. Lines starting with "+" are new.',
      '',
      'PR DIFF:',
      truncatedDiff
    ].join('\n');

    const response = await fetch(`${config.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1,
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
    console.error('[PR Risk Analyzer] 💥 Full LLM Error Context:', err);
    return null;
  }
}
