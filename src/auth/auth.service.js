/**
 * Authentication Service
 * Responsible for managing user sessions and login/logout logic.
 */

class AuthService {
  constructor() {
    this.isAuthenticated = false;
    this.currentUser = null;
  }

  /**
   * Logs In a user.
   * @param {string} username 
   * @param {string} password 
   * @returns {boolean}
   */
  login(username, password) {
    if (username === 'admin' && password === 'password123') {
      this.isAuthenticated = true;
      this.currentUser = { id: 1, role: 'admin' };
      return true;
    }
    return false;
  }

  /**
   * Logs Out the user.
   */
  logout() {
    this.isAuthenticated = false;
    this.currentUser = null;
  }

  /**
   * Checks if user is authenticated.
   * @returns {boolean}
   */
  isUserLoggedIn() {
    return this.isAuthenticated;
  }
}

module.exports = new AuthService();
