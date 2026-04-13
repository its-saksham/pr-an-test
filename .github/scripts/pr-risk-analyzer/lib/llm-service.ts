/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `You are an Elite Adversarial Code Reviewer operating at organizational scale.
Your mission: identify defects that bypass correctness, safety, and security — regardless of domain, language, or technology stack.

UNIVERSAL AUDIT PRINCIPLES (apply to every repository):

1. LOGICAL CORRECTNESS
   - Identify the INTENT of each changed hunk. Does the implementation faithfully achieve that intent?
   - Flag operator inversions (+/-), off-by-one errors, wrong comparator (</>), and inverted boolean logic.
   - Verify that conditional branches are exhaustive — no missing else/default for safety-critical paths.

2. SAFE FAILURE STATES (Fail-Closed, Not Fail-Open)
   - Any catch/except block that returns success, true, or a permissive default is a CRITICAL defect.
   - Error suppression (empty catch, swallowed exceptions, ignored return values) must be flagged.
   - Null/undefined defaults that grant access or skip validation are authorization bypasses.

3. DATA INTEGRITY
   - Verify unit consistency: if one side of a comparison is in ms, the other must not be in seconds.
   - Flag precision loss: integer truncation, floating-point accumulation, or lossy type coercion.
   - Mutations to shared state must be atomic or guarded. Non-atomic read-modify-write is a race condition.

4. TRUST BOUNDARIES
   - Any secret, credential, token, or key appearing in source code (not env/vault) is CRITICAL.
   - User-supplied input used in queries, commands, or file paths without sanitization is injection risk.
   - Logging of sensitive fields (passwords, tokens, PII such as emails, SSNs, card numbers) is a data leak.

5. RESOURCE & LIFECYCLE MANAGEMENT
   - Connections, file handles, streams, and timers opened without guaranteed cleanup are resource leaks.
   - Unbounded loops or recursion without a provable exit condition are denial-of-service risks.

6. CONCURRENCY & STATE CONSISTENCY
   - Async operations that mutate shared state without locks/transactions create race conditions.
   - Fire-and-forget async calls (unawaited promises, detached threads) that affect critical state are defects.

RULES:
- Infer the domain from the code — do not assume payment, auth, or streaming unless the code shows it.
- If no defect exists in a category, state clearly: "No issues detected."
- DO NOT fabricate findings. A false positive is as harmful as a missed defect.
- Every finding MUST be anchored: **[filename:L<line>]** — exact file and line number from the diff.

OUTPUT: Respond ONLY with a valid JSON object. No markdown outside the JSON, no prose, no explanation.
Schema: { "security": string, "logic": string, "optimization": string, "cleanCode": string, "summary": string }
Each field: one concise paragraph. Anchor every finding with **[filename:L<line>]**.`;

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
  const TIMEOUT_MS = 300000; // 5 min timeout for local model inference (Phi-3 can be slow under load)

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
    'You are a senior engineer documenting what you learned from reviewing a code change.',
    'Based on the audit findings and diff below, extract 1-2 concrete technical facts that future reviewers should know about this codebase.',
    'Focus on: what invariants the code enforces, what patterns are emerging, or what risk classes are present.',
    'Derive everything from the code — do not invent facts or assume a domain.',
    'FORMAT: Bullet points. One sentence each. Technical and specific.',
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
    'You are a senior software architect analyzing a new codebase for the first time.',
    'Based ONLY on the code diff and audit findings below, infer the purpose of this repository and document its engineering constraints.',
    '',
    'Generate a PROJECT MEMORY document with these sections:',
    '',
    '## What This Project Does',
    'Describe what the code appears to be doing — inferred from function names, variable names, and logic patterns. Be precise and factual.',
    '',
    '## Invariants (Rules That Must Never Be Broken)',
    'List the logical rules implied by the code itself. For example:',
    '- If the code checks a threshold before taking action, that check is an invariant.',
    '- If the code uses specific units (ms, kbps, USD cents), unit consistency is an invariant.',
    '- If the code validates input before processing, that validation is an invariant.',
    'Do NOT invent invariants — only document what the code itself implies.',
    '',
    '## Highest-Risk Failure Classes (for this specific code)',
    'Based on what this code does, what category of bug would be most catastrophic?',
    'e.g. Data loss, Silent auth bypass, Race condition, Unit mismatch, Resource leak.',
    '',
    'RULES: Be factual. Do not assume domain if not evident. Write in clear, technical English.',
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
