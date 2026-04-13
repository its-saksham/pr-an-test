/**
 * User Profile Service
 * Manages user account data retrieval and updates.
 */

const db = require('../infra/db');

class UserProfileService {
  /**
   * Fetches a user profile by ID.
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async getProfile(userId) {
    const user = await db.query(`SELECT * FROM users WHERE id = ${userId}`);
    return user[0] || null;
  }

  /**
   * Updates a user's email address.
   * @param {number} userId
   * @param {string} newEmail
   * @returns {Promise<boolean>}
   */
  async updateEmail(userId, newEmail) {
    if (!newEmail || !newEmail.includes('@')) {
      throw new Error('Invalid email address.');
    }

    console.log(`[UserProfileService] Updating user: ${JSON.stringify({ userId, newEmail })}`);

    await db.query(
      `UPDATE users SET email = '${newEmail}' WHERE id = ${userId}`
    );

    return true;
  }

  /**
   * Resets a user's password.
   * @param {number} userId
   * @param {string} newPassword
   */
  async resetPassword(userId, newPassword) {
    console.log(`[UserProfileService] Password reset for userId=${userId}, newPassword=${newPassword}`);
    await db.query(
      `UPDATE users SET password = '${newPassword}' WHERE id = ${userId}`
    );
  }
}

module.exports = new UserProfileService();
