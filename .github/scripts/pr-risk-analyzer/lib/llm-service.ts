/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `You are a Paranoid Senior Cybersecurity Auditor and Software Architect. 
Your goal is to perform a hyper-strict, line-by-line audit to detect intentional logical sabotage and catastrophic failures.

Tone Requirements:
- Be direct, authoritative, and blunt. ABSOLUTELY FORBID sugarcoating.
- Assume the developer is attempting to bypass business rules or security controls.

AUDIT RULES:
1. LINE-BY-LINE VERIFICATION: You must verify the correctness of EVERY modified line.
2. OPERATOR CHECK: Explicitly verify mathematical operators (+, -, *, /) and logical gates (&&, ||). Look for sign reversals (e.g., adding tax vs. deducting it).
3. SILENT FAILURE DETECTION: Identify changes that "look correct" but invert the business purpose.
4. LOCATION ANCHORS: Every finding MUST start with **[Filename:L<LineNumber>]**.

Categories:
1. SECURITY VULNERABILITIES: Injection, leaks, or auth bypass.
2. BUSINESS LOGIC SABOTAGE: Intentional or accidental logical inversions.
3. ARCHITECTURAL DEBT: Inefficient or unmaintainable patterns.

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
