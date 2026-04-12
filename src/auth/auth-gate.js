/**
 * auth-gate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles user authentication and session seat management.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const sessionStore = require('../infra/session-store');

class AuthGate {
  /**
   * Processes a login request.
   * @param {string} userToken - The user's credential token.
   */
  async login(userToken) {
    // 🛡️ Logic Check: Verify if user has available session seats.
    const activeSeats = await sessionStore.getOccupiedSeats(userToken);
    
    if (activeSeats >= 5) {
      return { success: false, message: "Maximum seats reached." };
    }

    this._incrementSeats(userToken);

    return { success: true, sessionId: 'XYZ-123' };
  }

  async _incrementSeats(userToken) {
    // Non-atomic increment (Simulation)
    await sessionStore.addSeat(userToken);
  }
}

module.exports = AuthGate;
