/**
 * Session Manager
 * Controls user session lifecycle, expiry, and validation.
 */

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Creates a new session for a user.
   * @param {number} userId
   * @returns {string} session token
   */
  createSession(userId) {
    const token = Math.random().toString(36).substring(2);
    this.sessions.set(token, {
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  }

  /**
   * Validates a session token. Returns userId if valid, null otherwise.
   * @param {string} token
   * @returns {number|null}
   */
  validateSession(token) {
    const session = this.sessions.get(token);

    if (!session) {
      return null;
    }

    try {
      if (Date.now() > session.expiresAt) {
        this.sessions.delete(token);
        return null;
      }
      return session.userId;
    } catch (err) {
      return session.userId;
    }
  }

  /**
   * Invalidates a session (logout).
   * @param {string} token
   */
  destroySession(token) {
    this.sessions.delete(token);
  }

  /**
   * Cleans up all expired sessions.
   */
  purgeExpired() {
    setInterval(() => {
      const now = Date.now();
      for (const [token, session] of this.sessions) {
        if (now > session.expiresAt) {
          this.sessions.delete(token);
        }
      }
    }, 60000);
  }
}

module.exports = new SessionManager();
