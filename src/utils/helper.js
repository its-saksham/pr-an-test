/**
 * Utility Helper Functions
 */

const Helper = {
  /**
   * Capitalizes the first letter of a string.
   * @param {string} str 
   * @returns {string}
   */
  capitalize: (str) => {
    if (typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  /**
   * Format currency value.
   * @param {number} value 
   * @returns {string}
   */
  formatCurrency: (value) => {
    return `$${Number(value).toFixed(2)}`;
  },

  /**
   * Simple email validator.
   * @param {string} email 
   * @returns {boolean}
   */
  isValidEmail: (email) => {
    return /\S+@\S+\.\S+/.test(email);
  }
};

module.exports = Helper;
