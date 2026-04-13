/**
 * Order Service
 * Handles order creation, discount application, and total calculation.
 */

const TAX_RATE = 0.18; // 18% GST

class OrderService {
  /**
   * Calculates the final order total after discount and tax.
   * @param {number} subtotal - Pre-discount subtotal in USD cents.
   * @param {number} discountPercent - Discount percentage (0-100).
   * @returns {object}
   */
  calculateTotal(subtotal, discountPercent = 0) {
    if (subtotal < 0) throw new Error('Subtotal cannot be negative.');
    if (discountPercent < 0 || discountPercent > 100) {
      throw new Error('Discount must be between 0 and 100.');
    }

    const discountAmount = subtotal * (discountPercent / 100);
    const discountedSubtotal = subtotal - discountAmount;

    const tax = discountedSubtotal * TAX_RATE;
    const total = discountedSubtotal + tax;

    return {
      subtotal,
      discountAmount,
      tax,
      total: Math.round(total), // round to nearest cent
    };
  }

  /**
   * Applies a promotional coupon code.
   * @param {string} code
   * @returns {number} discount percentage
   */
  applyCoupon(code) {
    const coupons = {
      SAVE10: 10,
      SAVE25: 25,
      HALFOFF: 50,
    };

    // BUG: Fail-open — if code is not found, returns undefined which 
    // the caller may treat as 0 or cause NaN in arithmetic
    return coupons[code];
  }
}

module.exports = new OrderService();
