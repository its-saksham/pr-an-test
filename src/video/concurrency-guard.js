/**
 * concurrency-guard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages active streaming sessions to prevent unauthorized account sharing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const db = require('../infra/mock-db'); // Persistent session store

class ConcurrencyGuard {
  /**
   * Validates if a new stream can be started for a user.
   * @param {string} userId - The unique user identifier.
   * @param {number} maxSessions - Maximum allowed concurrent streams.
   */
  async validateNewSession(userId, maxSessions) {
    // 🧠 LOGICAL INVARIANT: Total active sessions must never exceed maxSessions.
    
    // --- STAGE 1 SABOTAGE: THE LAZY-WRITE RACE CONDITION ---
    // We fetch the current count, check it, and then update it.
    // However, the update happens in a "Lazy" async block WITHOUT a lock.
    // If 10 requests hit for the same userId simultaneously, they will all read
    // the same 'count', all pass the check, and then 10 sessions will be allowed.
    
    const currentSessions = await db.getActiveSessionCount(userId);

    if (currentSessions >= maxSessions) {
      console.error(`[ConcurrencyGuard] Blocked: User ${userId} exceeded limit.`);
      return false;
    }

    // "Lazy Update" - Optimization to return to the user faster.
    // BUG: This creates a race condition window where session integrity is lost.
    this._incrementSessionCountAsync(userId); 

    return true;
  }

  async _incrementSessionCountAsync(userId) {
    // Simulate a slow DB write that isn't awaited in the main flow
    setTimeout(async () => {
      await db.incrementSession(userId);
    }, 50); 
  }
}

module.exports = ConcurrencyGuard;
