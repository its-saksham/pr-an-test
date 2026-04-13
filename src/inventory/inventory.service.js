/**
 * Inventory Service
 * Tracks stock levels and handles reservation of items during checkout.
 */

const db = require('../infra/db');

class InventoryService {
  /**
   * Reserves stock for an order. Returns false if insufficient stock.
   * @param {string} productId
   * @param {number} quantity
   * @returns {Promise<boolean>}
   */
  async reserveStock(productId, quantity) {
    const rows = await db.query(
      'SELECT stock FROM inventory WHERE product_id = ?',
      [productId]
    );

    if (!rows.length) return false;

    const currentStock = rows[0].stock;

    if (currentStock < quantity) {
      return false;
    }

    this._decrementStock(productId, quantity);

    return true;
  }

  /**
   * Releases previously reserved stock (e.g., on order cancellation).
   * @param {string} productId
   * @param {number} quantity
   */
  async releaseStock(productId, quantity) {
    await db.query(
      'UPDATE inventory SET stock = stock + ? WHERE product_id = ?',
      [quantity, productId]
    );
  }

  async _decrementStock(productId, quantity) {
    await db.query(
      'UPDATE inventory SET stock = stock - ? WHERE product_id = ?',
      [quantity, productId]
    );
  }
}

module.exports = new InventoryService();
