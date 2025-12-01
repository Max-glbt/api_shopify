import { pool } from '../config/database';
import crypto from 'crypto';

interface OrderData {
  id: number;
  email: string;
  total_price: string;
  currency: string;
}

interface CustomerBalance {
  id: number;
  email: string;
  shopify_id: number;
  points_balance: number;
}

const generateTransactionHash = (
  shopifyId: number,
  orderId: number
): string => {
  const data = `${shopifyId}-${orderId}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

export const getOrCreateCustomer = async (
  email: string,
  shopifyId: number
): Promise<CustomerBalance> => {
  const client = await pool.connect();
  try {
    // SERIALIZABLE isolation prevents race conditions
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const result = await client.query(
      'SELECT id, email, shopify_id, points_balance FROM customers WHERE email = $1',
      [email]
    );

    let customerId: number;

    if (result.rows.length > 0) {
      customerId = result.rows[0].id;
      console.log(`[LOYALTY] Existing customer: ${email} (ID: ${customerId})`);
    } else {
      const insertResult = await client.query(
        `INSERT INTO customers (email, shopify_id, points_balance)
         VALUES ($1, $2, 0)
         RETURNING id, email, shopify_id, points_balance`,
        [email, shopifyId]
      );
      customerId = insertResult.rows[0].id;
      console.log(`[LOYALTY] New customer created: ${email} (ID: ${customerId})`);
    }

    const balanceResult = await client.query(
      'SELECT id, email, shopify_id, points_balance FROM customers WHERE id = $1',
      [customerId]
    );

    await client.query('COMMIT');
    return balanceResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[LOYALTY] Error in get_or_create_customer:', error);
    throw error;
  } finally {
    client.release();
  }
};

// 1 EUR = 1 point, SERIALIZABLE transaction
export const addPointsToCustomer = async (
  orderData: OrderData
): Promise<{ success: boolean; newBalance: number; transactionId?: number }> => {
  const client = await pool.connect();

  try {
    // SERIALIZABLE = no race condition with concurrent requests
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const { id: orderId, email, total_price, currency } = orderData;

    if (currency !== 'EUR') {
      console.warn(`[LOYALTY] Unsupported currency: ${currency}. Only EUR accepted.`);
      await client.query('ROLLBACK');
      return { success: false, newBalance: 0 };
    }

    const pointsToAdd = Math.floor(parseFloat(total_price));

    if (pointsToAdd <= 0) {
      console.log(`[LOYALTY] No points to add for order ${orderId}`);
      await client.query('ROLLBACK');
      return { success: false, newBalance: 0 };
    }

    const customerResult = await client.query(
      `SELECT id, shopify_id FROM customers WHERE email = $1`,
      [email]
    );

    let customerId: number;
    let shopifyId: number;

    if (customerResult.rows.length > 0) {
      customerId = customerResult.rows[0].id;
      shopifyId = customerResult.rows[0].shopify_id;
    } else {
      const insertResult = await client.query(
        `INSERT INTO customers (email, shopify_id, points_balance)
         VALUES ($1, $2, 0)
         RETURNING id, shopify_id`,
        [email, orderId]
      );
      customerId = insertResult.rows[0].id;
      shopifyId = insertResult.rows[0].shopify_id;
    }

    const transactionHash = generateTransactionHash(shopifyId, orderId);

    const existingTransaction = await client.query(
      'SELECT id FROM transactions WHERE transaction_hash = $1',
      [transactionHash]
    );

    if (existingTransaction.rows.length > 0) {
      console.log(
        `[LOYALTY] Duplicate transaction detected for order ${orderId}. Ignored.`
      );
      await client.query('ROLLBACK');
      return { success: false, newBalance: 0 };
    }

    const updateResult = await client.query(
      `UPDATE customers 
       SET points_balance = points_balance + $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING points_balance`,
      [pointsToAdd, customerId]
    );

    const newBalance = updateResult.rows[0].points_balance;

    const transactionResult = await client.query(
      `INSERT INTO transactions (customer_id, order_id, amount_eur, points_added, transaction_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [customerId, orderId, total_price, pointsToAdd, transactionHash]
    );

    const transactionId = transactionResult.rows[0].id;

    await client.query('COMMIT');

    console.log(
      `[LOYALTY] ${pointsToAdd} points added to ${email}. New balance: ${newBalance}`
    );

    return { success: true, newBalance, transactionId };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[LOYALTY] Error in add_points_to_customer:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const getCustomerBalance = async (
  email: string
): Promise<CustomerBalance | null> => {
  try {
    const result = await pool.query(
      'SELECT id, email, shopify_id, points_balance FROM customers WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('[LOYALTY] Error in get_customer_balance:', error);
    throw error;
  }
};

export const getAllCustomers = async (): Promise<CustomerBalance[]> => {
  try {
    const result = await pool.query(
      'SELECT id, email, shopify_id, points_balance FROM customers ORDER BY created_at DESC'
    );
    return result.rows;
  } catch (error) {
    console.error('[LOYALTY] Error in get_all_customers:', error);
    throw error;
  }
};
