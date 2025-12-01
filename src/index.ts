import express from 'express';
import dotenv from 'dotenv';
import { verifyShopifyWebhook } from './security/hmacVerification';
import { initializeDatabase } from './config/database';
import { initializeRedis, enqueueWebhook, isWebhookProcessed } from './config/redis';
import { startWorker } from './services/webhookWorker';
import { getCustomerBalance, getAllCustomers } from './services/loyaltyService';
import crypto from 'crypto';

dotenv.config();

const app = express();

app.use(express.json({
  verify: (req: any, res: any, buf: any, encoding: any) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.post('/webhooks/orders/create', 
  verifyShopifyWebhook,
  async (req: any, res: any) => {
    try {
      const orderData = req.body;
      
      console.log('[INDEX] Webhook reçu pour commande:', orderData.id);

      const webhookId = crypto
        .createHash('sha256')
        .update(JSON.stringify(orderData))
        .digest('hex');

      const alreadyProcessed = await isWebhookProcessed(webhookId);
      if (alreadyProcessed) {
        console.log(`[INDEX] Webhook ${webhookId} already processed. Ignoring.`);
        res.status(200).json({ status: 'already_processed', id: webhookId });
        return;
      }

      await enqueueWebhook(JSON.stringify(orderData));
      console.log(`[INDEX] Webhook ${webhookId} enqueued for processing`);

      res.status(200).json({ 
        status: 'queued',
        id: webhookId,
        message: 'Webhook reçu et en cours de traitement'
      });
      
    } catch (error) {
      console.error('[INDEX] Erreur traitement webhook:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: (error as Error).message 
      });
    }
  }
);

app.get('/customers/:email/balance', async (req: any, res: any) => {
  try {
    const { email } = req.params;
    const customer = await getCustomerBalance(email);

    if (!customer) {
      res.status(404).json({
        error: 'Customer not found',
        email
      });
      return;
    }

    res.status(200).json({
      email: customer.email,
      points_balance: customer.points_balance,
      shopify_id: customer.shopify_id
    });
  } catch (error) {
    console.error('[INDEX] Erreur get balance:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message
    });
  }
});

app.get('/customers', async (req: any, res: any) => {
  try {
    const customers = await getAllCustomers();
    res.status(200).json({
      count: customers.length,
      customers: customers.map(c => ({
        email: c.email,
        points_balance: c.points_balance,
        shopify_id: c.shopify_id
      }))
    });
  } catch (error) {
    console.error('[INDEX] Erreur get customers:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message
    });
  }
});

app.get('/health', (req: any, res: any) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

const startServer = async () => {
  try {
    console.log('[STARTUP] Initializing PostgreSQL...');
    await initializeDatabase();

    console.log('[STARTUP] Initializing Redis...');
    await initializeRedis();

    console.log('[STARTUP] Starting worker...');
    startWorker(1000);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`\n[STARTUP] Serveur démarré sur le port ${PORT}`);
      console.log(`[STARTUP] Webhooks: POST http://localhost:${PORT}/webhooks/orders/create`);
      console.log(`[STARTUP] Balance client: GET http://localhost:${PORT}/customers/:email/balance`);
      console.log(`[STARTUP] Tous les clients: GET http://localhost:${PORT}/customers`);
      console.log(`[STARTUP] Health: GET http://localhost:${PORT}/health\n`);
    });

    process.on('SIGTERM', () => {
      console.log('[STARTUP] SIGTERM received, shutting down gracefully...');
      process.exit(0);
    });

  } catch (error) {
    console.error('[STARTUP] Startup error:', error);
    process.exit(1);
  }
};

startServer();