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
 * Includes a 3-attempt retry mechanism and 60s timeout for resilience.
 */
export async function analyzePrDiff(
  diff: string, 
  config: LlmConfig, 
  projectContext: string = ''
): Promise<LlmAnalysis | null> {
  const RETRY_ATTEMPTS = 3;
  const TIMEOUT_MS = 60000; // 60s timeout for local model inference

  if (!diff || !config.endpoint) {
    if (!config.endpoint) console.warn('[PR Risk Analyzer] 🤖 LLM Analysis skipped: No endpoint provided.');
    return null;
  }

  const truncatedDiff = diff.length > MAX_DIFF_LENGTH 
    ? diff.substring(0, MAX_DIFF_LENGTH) + '\n\n[... Diff truncated ...]' 
    : diff;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      console.log(`[PR Risk Analyzer] 🤖 Querying Universal Auditor (Attempt ${attempt}/${RETRY_ATTEMPTS})...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const dnaNote = projectContext.trim() 
        ? `\n\n--- PROJECT DNA & DOMAIN INVARIANTS ---\n${projectContext}\n------------------------------------------`
        : '';

      const userMessage = [
        'Perform a high-fidelity security and logic audit based on the principles below.',
        dnaNote,
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
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API returned ${response.status}: ${errorText}`);
      }

      const data: any = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) throw new Error('LLM returned empty content.');

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
    } catch (err: any) {
      const isLastAttempt = attempt === RETRY_ATTEMPTS;
      const errorMsg = err.name === 'AbortError' ? 'Request Timed Out (60s)' : err.message;

      console.warn(`[PR Risk Analyzer] ⚠️ Attempt ${attempt} failed: ${errorMsg}`);

      if (isLastAttempt) {
        console.error('[PR Risk Analyzer] ❌ Final attempt failed. Surfacing error to PR.');
        return {
          security: `⚠️ LLM Connection Failure: ${errorMsg}`,
          logic: 'Evaluation skipped due to connection error.',
          optimization: 'N/A',
          deadCode: 'N/A',
          maintainability: 'N/A',
          summary: `### ❌ AI Evaluation Unavailable\nThe local LLM endpoint at your runner failed to respond after ${RETRY_ATTEMPTS} attempts.\n**Error:** ${errorMsg}`,
          raw: errorMsg
        };
      }
      
      // Short delay before retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }

  return null;
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

/**
 * Autonomously initializes the Project DNA template from scratch.
 * Used when the auditor detects an empty or missing memory file.
 */
export async function initializeProjectDna(
  diff: string, 
  config: LlmConfig, 
  findings: string
): Promise<string> {
  const prompt = [
    'You are a Universal System Architect.',
    'Based on the code diff and audit findings below, generate a 🧬 PROJECT DNA & LOGICAL INVARIANTS template for this repository.',
    '',
    'REQUIRED SECTIONS:',
    '1. DOMAIN IDENTITY: (e.g., Financial Ledger, Cloud Infra, Medical Dosage).',
    '2. ATOMIC LOGICAL INVARIANTS: The "Atomic Truths" that must never be violated (e.g., "Tax must always be additive").',
    '3. GLOBAL THREAT MODEL: What are the highest-consequence failures for this domain?',
    '',
    'FORMAT: High-fidelity Markdown with headers. Be authoritative and technical.',
    '',
    'AUDIT FINDINGS:',
    findings,
    '',
    'PR DIFF:',
    diff.substring(0, 4000)
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
    const content = data.choices[0]?.message?.content || '';
    
    return [
      '# 🧬 Project DNA & Logical Invariants',
      '',
      'This file defines the **Universal Identity** and **Atomic Truths** of this repository.',
      '',
      content,
      '',
      '---',
      `## 🧪 Repository-Specific Learning Journal`,
      `- **${new Date().toISOString().split('T')[0]}**: Project Memory autonomously initialized via Zero-Shot Audit.`,
      ''
    ].join('\n');
  } catch (err) {
    console.warn('[PR Risk Analyzer] 🤖 DNA Initialization failed.');
    return '';
  }
}
