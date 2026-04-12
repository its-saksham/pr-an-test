/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `You are a Universal Principal-Based Security Auditor. 
Your goal is to perform a high-fidelity audit of code changes, focusing on logical invariants and critical threat vectors.

AUDIT DIRECTIVES (5,000 Repo Scale):
1. CONTEXT-WEIGHTED SCRUTINY:
   - IDENTITY/AUTH FILES: Audit for authorization bypass, hardcoded tokens, and weak cryptography.
   - BUSINESS ENGINE/PROCESSORS: Audit for Logical Invariants. Verify every arithmetic operator (+, -, *, /) and boolean gate (&&, ||) against domain norms.
   - CONFIG/INFRA: Audit for secret exposure, PII leakage in logs, and insecure defaults.
2. INVARIANCE VERIFICATION: Identify the "Atomic Truth" of the hunk. If a line changes 'total += tax' to 'total -= tax', identify it as a "CRITICAL Logical Invariant Breach."
3. SILENT FAILURE DETECTION: Look for code that swallows errors or defaults to a "Success/Fail-Open" state (e.g., 'return true' in a catch block).
4. LOCATION ANCHORS: Findings MUST start with **[Filename:L<LineNumber>]**.

TONE: Use Elite Red-Teamer language: blunt, authoritative, and consequence-focused.

Response Format: JSON object {"security", "logic", "optimization", "cleanCode", "summary"}.
Each value: One critical, pinpoint paragraph starting with the location anchor (e.g., "**[processor.js:L71]** Critical: Logical Invariant Breach...").`;

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
    console.log(`[PR Risk Analyzer] 🤖 Querying Universal Auditor (${config.model}) at ${config.endpoint}...`);

    const priorityNote = config.priorityFiles?.length 
      ? `\nCRITICAL FILES TO AUDIT FIRST: ${config.priorityFiles.join(', ')}`
      : '';
    
    const dnaNote = projectContext.trim() 
      ? `\n\n--- PROJECT DNA & DOMAIN INVARIANTS ---\n${projectContext}\n------------------------------------------`
      : '';

    const userMessage = [
      'Perform a high-fidelity security and logic audit based on the principles below.',
      priorityNote,
      dnaNote,
      '',
      'DIFF HUNK GUIDE: @@ -A,B +C,D @@; lines with "+" are new.',
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
      throw new Error(`LLM API Error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) return null;

    try {
      const parsed = JSON.parse(content);
      return {
        security: parsed.security || 'No Critical vulnerabilities detected.',
        logic: parsed.logic || 'Logical state transitions are consistent.',
        optimization: parsed.optimization || 'Code efficiency is compliant.',
        deadCode: parsed.cleanCode || parsed.deadCode || 'Standards maintained.',
        maintainability: parsed.summary || 'Summary not available.',
        summary: parsed.summary || content,
        raw: content
      };
    } catch (parseErr) {
      return {
        security: 'See summary.', logic: 'See summary.', optimization: 'See summary.',
        deadCode: 'See summary.', maintainability: 'See summary.', summary: content, raw: content
      };
    }
  } catch (err: any) {
    console.warn(`[PR Risk Analyzer] 🤖 Universal Audit failed: ${err.message}`);
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
    'You are a Project DNA Architect.',
    'Based on the audit findings and the diff below, extract 1-2 ARCHITECTURAL truths or EVOLVING invariants for this project.',
    'Focus: New patterns, structural migrations, or domain clarifications (e.g., "Learned: Payment state now requires a multi-sig approval in auth.js").',
    'FORMAT: Bullet points. Direct, technical, and one-sentence.',
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
    return '';
  }
}
