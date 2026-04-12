# 🧠 AI Auditor - Project Memory & Context

This file serves as the persistent "source of truth" and project-specific brain for the AI. 
It contains business invariants, quality rules, and lessons learned from past audits.

---

## 🏗️ Project Invariants (Business & Logic)
- **Financial Integrity**: In `processor.js`, all tax calculations MUST be strictly additive to the total. Any subtraction of tax from the subtotal is a CRITICAL LETHAL vulnerability.
- **Rounding Logic**: Use `Math.round` for final customer cents to prevent accumulation of floating-point debt.
- **Precision**: Always manipulate currency in integer cents.

## 🛡️ Security Posture (Red-Team Directives)
- **Adversarial Mindset**: Always assume code changes are a trojan horse for bypass or sabotage.
- **SQLi Prohibition**: We use raw SQL in some legacy modules; every `WHERE` clause must be verified for string concatenation vulnerabilities.
- **PII Leakage**: Never log objects like `paymentData` directly; specifically verify that CC numbers and CVVs are masked or omitted.

## 🧹 Code Quality Standards
- **Asynchronous Flow**: Favor `async/await` over raw promises. Every `await` block must have explicit error handling (try/catch).
- **Naming Conventions**: Use descriptive, domain-aligned names (e.g., `calculateFinalTotal` instead of `doCalc`).
- **Technical Debt**: Flag any redundant or unused "TODO" blocks left in production paths.

## 📈 Learning Journal (Dynamic Context)
- **2026-04-12**: Initialized memory loop. AI persona set to "Elite Red-Team Lead".
