/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `You are a Senior Mechanical Code Verifier. 
Your sole task is to verify the logical and mathematical correctness of code changes.

AUDIT RULES:
1. NO ROLEPLAY: Never output meta-commentary, debug logs, or roleplay as a software tool. Output only raw technical findings in the required JSON format.
2. OPERATOR VERIFICATION: Manually verify every arithmetic sign (+, -, *, /) and logical operator (&&, ||, !). Look specifically for inversions (e.g., deducting tax instead of adding it).
3. TRUTHTELLING: If you cannot find a vulnerability or logic error in a given section, state that the logic is sound. Do not hallucinate errors.
4. LOCATION ANCHORS: Every finding MUST start with **[Filename:L<LineNumber>]**.

Categories:
1. SECURITY: Injection risks, data leaks, or authentication failures.
2. LOGIC: Business rule violations, arithmetic sign swaps, or state-machine errors.
3. QUALITY: Performance bottlenecks or cumulative technical debt.

Response Format: JSON object {"security", "logic", "optimization", "cleanCode", "summary"}.
Each value: One critical paragraph starting with the location anchor.`;

const MAX_DIFF_LENGTH = 7500;

export interface LlmConfig {
  endpoint: string;
  model: string;
  priorityFiles?: string[];
}

/**
 * Communicates with a local LLM to get qualitative insights.
 */
export async function analyzePrDiff(
  diff: string, 
  config: LlmConfig, 
  projectContext: string = ''
): Promise<LlmAnalysis | null> {
  if (!diff || !config.endpoint) {
    if (!config.endpoint) console.warn('[PR Risk Analyzer] 🤖 LLM Analysis skipped: No endpoint provided.');
    return null;
  }

  const truncatedDiff = diff.length > MAX_DIFF_LENGTH 
    ? diff.substring(0, MAX_DIFF_LENGTH) + '\n\n[... Diff truncated ...]' 
    : diff;

  try {
    console.log(`[PR Risk Analyzer] 🤖 Querying local LLM (${config.model}) at ${config.endpoint}...`);

    const priorityNote = config.priorityFiles?.length 
      ? `\nCRITICAL FILES TO FOCUS ON: ${config.priorityFiles.join(', ')}`
      : '';
    
    const contextNote = projectContext.trim() 
      ? `\n\n--- PROJECT-SPECIFIC CONTEXT & BUSINESS RULES ---\n${projectContext}\n-------------------------------------------------`
      : '';

    const userMessage = [
      'Verify the following PR diff for mathematical and logical errors.',
      priorityNote,
      contextNote,
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
        security: parsed.security || 'Security and data safety look solid.',
        logic: parsed.logic || 'Logical flow is sound.',
        optimization: parsed.optimization || 'Code efficiency is acceptable.',
        deadCode: parsed.cleanCode || parsed.deadCode || 'Code is maintainable.',
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

/**
 * Synthesizes new project knowledge from a PR audit to be stored in history.
 */
export async function synthesizeKnowledge(
  diff: string, 
  config: LlmConfig, 
  findings: string
): Promise<string> {
  const prompt = [
    'You are a Project Architect summarizing recent changes.',
    'Based on the audit findings and the code diff below, extract 1-2 NEW technical facts about this project.',
    'Focused on: Architectural shifts, new quality standards, or specific business rule discoveries (e.g., "Learned: tax is now processed via the EU-tax service").',
    'FORMAT: Bullet points. Direct and one-sentence each.',
    '',
    'AUDIT FINDINGS:',
    findings,
    '',
    'PR DIFF:',
    diff.substring(0, 3000)
  ].join('\n');

  try {
    const response = await fetch(`${config.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });

    const data: any = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (err) {
    console.warn('[PR Risk Analyzer] 🤖 Knowledge Synthesis failed (skipping context update).');
    return '';
  }
}
