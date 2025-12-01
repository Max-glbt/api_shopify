import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'loyalty_db',
  user: process.env.DB_USER || 'loyalty_user',
  password: process.env.DB_PASSWORD || 'loyalty_password',
});

pool.on('error', (err: Error) => {
  console.error('[DATABASE] Unexpected pool error:', err);
});


// Initialise la connexion et retourne un client
export const getConnection = async (): Promise<PoolClient> => {
  try {
    const client = await pool.connect();
    console.log('[DATABASE] Connection acquired from pool');
    return client;
  } catch (error) {
    console.error('[DATABASE] Connection error:', error);
    throw error;
  }
};

export const initializeDatabase = async (): Promise<void> => {
  const client = await getConnection();
  try {
    console.log('[DATABASE] Initializing database schema');


    // table des clients
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        shopify_id BIGINT UNIQUE NOT NULL,
        points_balance BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // index pour email et shopify_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
      CREATE INDEX IF NOT EXISTS idx_customers_shopify_id ON customers(shopify_id);
    `);

    // table des transactions de points
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        order_id BIGINT NOT NULL,
        amount_eur DECIMAL(10, 2) NOT NULL,
        points_added BIGINT NOT NULL,
        transaction_hash VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // index pour customer_id, order_id et transaction_hash
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(transaction_hash);
    `);

    console.log('[DATABASE] Database initialized successfully');

  } catch (error) {
    console.error('[DATABASE] Initialization error:', error);
    throw error;

  } finally {
    client.release();
  }

};

export { pool };
