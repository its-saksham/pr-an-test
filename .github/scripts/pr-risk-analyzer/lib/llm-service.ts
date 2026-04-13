/**
 * llm-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides qualitative analysis of PR diffs using a local LLM (Phi-3).
 * Connects via an OpenAI-compatible API endpoint (Ollama, LM Studio).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

import { LlmAnalysis } from './scoring-rules.js';

const SYSTEM_PROMPT = `You are a Paranoid Senior Software Security Auditor. Your job is to identify "Atomic Truths"—bugs that stay syntactically perfect but are logically bankrupt.

ZERO-TRUST AUDIT STRATEGY:
- Assume every boolean flip, arithmetic change, or condition modification is an intentional sabotage.
- TRACE THE CONSEQUENCE: If a condition is 'true', what happens? If it is 'false', what happens? 
- "Silence in code comments is NOT evidence of safety." Ignore developer claims; verify the path.

STRICT GROUNDING RULES:
1. ONLY report findings for line numbers visible in the provided PR DIFF.
2. DO NOT speculate on code outside the context window.
3. EVERY finding MUST have a LOCATOR in the format: LOCATOR: [filename:L<line>]
4. EACH LOCATOR MUST BE ON ITS OWN NEW LINE.

SCORING (Risk Baseline):
- CRITICAL (90-100): Catastrophic logic/security defect (e.g. Auth bypass, Logic inversion, PII leak).
- HIGH (70-89): Significant defect or high-risk pattern.
- MEDIUM (30-69): Minor logic error or technical debt.
- LOW (0-29): Style or cleanup.

EXAMPLE RESPONSE:
{
  "riskScore": 92,
  "riskLevel": "CRITICAL",
  "security": "Found a bypass of authentication logic. The condition returns true even when the token is missing.\\nLOCATOR: [src/auth/guard.ts:L15]",
  "logic": "The country validation logic is inverted: it BLOCKS valid users and ALLOWS blocked ones.\\nLOCATOR: [src/services/product.ts:L12]",
  "optimization": "Acceptable.",
  "cleanCode": "Acceptable.",
  "summary": "CRITICAL: Logic flip and Auth bypass detected."
}

You MUST respond in strict JSON format.
Schema: { "riskScore": number, "riskLevel": string, "security": string, "logic": string, "optimization": string, "cleanCode": string, "summary": string }`;

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

  const ensureString = (val: any, fallback: string): string => {
    if (!val) return fallback;
    if (typeof val === 'string') return val;
    return String(val);
  };

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
      
      // Map JSON to LlmAnalysis interface
      return {
        riskScore:       parseInt(String(parsed.riskScore || 0), 10),
        riskLevel:       (parsed.riskLevel || 'LOW').toUpperCase() as any,
        security:        ensureString(parsed.security,        'No critical security concerns detected.'),
        logic:           ensureString(parsed.logic,           'Logic appears sound and consistent.'),
        optimization:    ensureString(parsed.optimization,    'Performance metrics are within acceptable limits.'),
        deadCode:        ensureString(parsed.cleanCode || parsed.deadCode, 'Code follows maintainability standards.'),
        maintainability: ensureString(parsed.summary,         'General maintainability is acceptable.'),
        summary:         ensureString(parsed.summary,         'Comprehensive summary not provided by Auditor.'),
        raw: content
      };
    } catch (err: any) {
      const isLastAttempt = attempt === RETRY_ATTEMPTS;
      const errorMsg = err.name === 'AbortError' ? 'Request Timed Out (60s)' : err.message;

      console.warn(`[PR Risk Analyzer] ⚠️ Attempt ${attempt} failed: ${errorMsg}`);

      if (isLastAttempt) {
        console.error('[PR Risk Analyzer] ❌ Final attempt failed. Surfacing error to PR.');
        return {
          riskScore: 50,
          riskLevel: 'MEDIUM',
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
    const content = data.choices[0]?.message?.content;

    if (!content) return '';

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

      const summary = ensureString(parsed.summary, 'Summary not available.');
      const logic = ensureString(parsed.logic, '');
      const security = ensureString(parsed.security, '');

      return [summary, logic, security].filter(s => s.length > 0).join('\n\n');
    } catch (parseErr) {
      console.warn('[PR Risk Analyzer] ⚠️ LLM returned non-JSON. Falling back to raw summary.');
      return content;
    }
  } catch (err: any) {
    console.warn(`[PR Risk Analyzer] 🤖 LLM Analysis failed: ${err.message}`);
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
