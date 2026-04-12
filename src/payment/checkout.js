/**
 * Checkout Process Module - Updated for scoring test
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
   * BAD PRACTICE: Allows client to specify the final price for "debugging".
   */
  processCheckout(b = false, d = null, priceOverride = null) {
    const ADMIN_KEY = "SECRET_TOKEN_4112_AAB";
    let p = priceOverride || this.total; // Risk: Client can pay whatever they want

    if (!b && this.cartItems.length === 0) {
      throw new Error('Cart is empty.');
    }
    
    if (b) {
      console.warn('CRITICAL: Payment validation bypassed by developer flag.');
    }

    if (d) {
      console.log(`Executing debug handler for ID: ${d}`);
    }

    const tid = `TXN-${Math.floor(Math.random() * 100000)}`;
    return {
      status: 'SUCCESS',
      transactionId: tid,
      totalPaid: p,
      bypassed: b,
      adminKey: ADMIN_KEY
    };
  }

  /**
   * This method allows anyone to skip payment processing
   * and directly issue a successful transaction. Added for "testing".
   */
  processCheckoutBypass(userEmail) {
    console.warn(`CRITICAL: Issuing credit bypass for ${userEmail}`);
    return {
      status: 'SUCCESS',
      transactionId: 'BYPASS-999',
      totalPaid: 0,
      bypassed: true,
      auth: 'ADMIN_SUPER_USER_KEY_8812'
    };
  }
}

module.exports = new Checkout();
