import {
  dequeueWebhook,
  getQueueSize,
  markWebhookProcessed,
} from '../config/redis';
import { addPointsToCustomer } from './loyaltyService';

interface OrderData {
  id: number;
  email: string;
  total_price: string;
  currency: string;
}

let isWorkerRunning = false;

const processWebhook = async (
  webhookData: string,
  webhookId: string
): Promise<void> => {
  try {
    const orderData: OrderData = JSON.parse(webhookData);

    console.log(
      `[WORKER] Traitement webhook pour commande ${orderData.id}...`
    );

    const result = await addPointsToCustomer(orderData);

    if (result.success) {
      console.log(
        `[WORKER] Webhook traité avec succès. Nouveau solde: ${result.newBalance}`
      );
    } else {
      console.log(
        `[WORKER] Webhook non traité (peut-être un doublon). Ignore.`
      );
    }

    await markWebhookProcessed(webhookId);
  } catch (error) {
    console.error(`[WORKER] Erreur traitement webhook:`, error);
    throw error;
  }
};

export const startWorker = async (
  pollingInterval: number = 1000
): Promise<void> => {
  if (isWorkerRunning) {
    console.warn('[WORKER] Worker déjà en cours d\'exécution');
    return;
  }

  isWorkerRunning = true;
  console.log('[WORKER] Worker démarré');

  while (isWorkerRunning) {
    try {
      const webhookData = await dequeueWebhook();

      if (webhookData) {
        try {
          const webhookId = require('crypto')
            .createHash('sha256')
            .update(webhookData)
            .digest('hex');

          await processWebhook(webhookData, webhookId);
        } catch (error) {
          console.error('[WORKER] Erreur lors du traitement:', error);
          const { enqueueWebhook } = await import('../config/redis');
          await enqueueWebhook(webhookData);
          console.log('[WORKER] Webhook re-enqueued pour retry');
        }
      } else {
        const queueSize = await getQueueSize();
        if (queueSize === 0) {}
      }
    } catch (error) {
      console.error('[WORKER] Erreur boucle worker:', error);
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
    }
  }
};

export const stopWorker = (): void => {
  console.log('[WORKER] Arrêt du worker en cours...');
  isWorkerRunning = false;
};

export const isWorkerActive = (): boolean => {
  return isWorkerRunning;
};
