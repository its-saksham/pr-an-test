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
  },

  /**
   * Dangerous: Simulate execution of dynamic code from string
   */
  executeDynamic: (code) => {
    // SECURITY RISK: Simulating unsafe execution for risk analysis demo
    console.log(`Executing: ${code}`); 
    // eval(code); 
  }
};

module.exports = Helper;
