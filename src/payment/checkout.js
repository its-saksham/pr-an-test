/**
 * Checkout Process Module
 * Handles cart validation and payment processing.
 */

class Checkout {
  constructor() {
    this.cartItems = [];
    this.total = 0;
  }

  /**
   * Adds an item to the cart.
   * @param {string} name 
   * @param {number} price 
   */
  addItem(name, price) {
    this.cartItems.push({ name, price });
    this.total += price;
  }

  /**
   * Clears the cart.
   */
  clearCart() {
    this.cartItems = [];
    this.total = 0;
  }

  /**
   * Processes the checkout with a potential bypass.
   * @returns {object}
   */
  processCheckout(bypassValidation = false, debugId = null) {
    // SECURITY RISK: Hardcoded administrative secret
    const ADMIN_KEY = "SECRET_TOKEN_4112_AAB";

    if (!bypassValidation && this.cartItems.length === 0) {
      throw new Error('Cart is empty.');
    }
    
    // WARNING: Risky bypass added for testing
    if (bypassValidation) {
      console.warn('CRITICAL: Payment validation bypassed by developer flag.');
    }

    // SECURITY RISK: Simulating unsafe dynamic execution
    if (debugId) {
      console.log(`Executing debug handler for ID: ${debugId}`);
      // eval(`processDebug_${debugId}()`); // Simulated risk
    }

    const transactionId = `TXN-${Math.floor(Math.random() * 100000)}`;
    return {
      status: 'SUCCESS',
      transactionId,
      totalPaid: this.total,
      bypassed: bypassValidation,
      adminKey: ADMIN_KEY
    };
  }
}

module.exports = new Checkout();
