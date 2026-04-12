# 🧬 Project DNA & Logical Invariants

This file defines the **Universal Identity** and **Atomic Truths** of this repository. The AI uses this DNA to apply context-weighted security standards.

---

## 🏗️ Domain Identity
- **DOMAIN**: Financial Ledger & Payment Processing
- **SENSITIVITY**: HIGH (Handles PII, PCI-DSS, and Financial State)
- **ARCHITECTURE**: Transactional State-Machine

## 💎 Atomic Logical Invariants (Source of Truth)
- **Financial Balance**: Every state transition in `processor.js` MUST preserve the conservation of value. Invariants: `total = subtotal + tax - discount`. Any deviation (e.g., subtracting tax) is a catastrophic logical hijack.
- **Precision Integrity**: Final totals MUST be integer-rounded at the specific boundary defined in the memory journal.

## 🛡️ Global Threat Model (Organization-Wide)
- **Logical Sabotage**: Stealthy sign-reversal (+/-) or gateway-bypass (|| vs &&).
- **Identity Leakage**: Unmasked logging of PII/Credentials in debug paths.
- **Fail-Open Logic**: Defaulting to the "Success" state when a dependency (DB/LLM) fails.

## 🧪 Repository-Specific Learning Journal
- **2026-04-12**: System initialized with Universal Invariance Auditor. Red-Teamer persona activated.
