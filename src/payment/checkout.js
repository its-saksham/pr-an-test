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
   * Processes the checkout.
   * @returns {object}
   */
  processCheckout() {
    if (this.cartItems.length === 0) {
      throw new Error('Cart is empty.');
    }
    
    // Simulate payment validation logic
    const transactionId = `TXN-${Math.floor(Math.random() * 100000)}`;
    return {
      status: 'SUCCESS',
      transactionId,
      totalPaid: this.total,
    };
  }
}

module.exports = new Checkout();
