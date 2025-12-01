import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient: RedisClientType;

export const initializeRedis = async (): Promise<RedisClientType> => {
  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      reconnectStrategy: (retries: number) => {
        const delay = Math.min(retries * 50, 500);
        console.log(`[REDIS] Reconnection attempt (${retries})`);
        return delay;
      },
    },
    password: process.env.REDIS_PASSWORD || undefined,
  });

  redisClient.on('error', (err: Error) => {
    console.error('[REDIS] Redis error:', err);
  });

  redisClient.on('connect', () => {
    console.log('[REDIS] Connected to Redis');
  });

  try {
    await redisClient.connect();
    console.log('[REDIS] Connection established successfully');
    return redisClient;
  } catch (error) {
    console.error('[REDIS] Connection error:', error);
    throw error;
  }
};

export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

export const WEBHOOK_DEDUP_KEY = 'webhook:processed:';
export const WEBHOOK_DEDUP_TTL = 86400;
export const WEBHOOK_QUEUE_KEY = 'webhook:queue';

export const isWebhookProcessed = async (
  webhookId: string
): Promise<boolean> => {
  const client = getRedisClient();
  const key = `${WEBHOOK_DEDUP_KEY}${webhookId}`;
  const exists = await client.exists(key);
  return exists === 1;
};

export const markWebhookProcessed = async (
  webhookId: string
): Promise<void> => {
  const client = getRedisClient();
  const key = `${WEBHOOK_DEDUP_KEY}${webhookId}`;
  await client.setEx(key, WEBHOOK_DEDUP_TTL, '1');
  console.log(`[REDIS] Webhook ${webhookId} marked as processed`);
};

export const enqueueWebhook = async (webhookData: string): Promise<void> => {
  const client = getRedisClient();
  await client.rPush(WEBHOOK_QUEUE_KEY, webhookData);
  console.log('[REDIS] Webhook added to queue');
};

export const dequeueWebhook = async (): Promise<string | null> => {
  const client = getRedisClient();
  const data = await client.lPop(WEBHOOK_QUEUE_KEY);
  if (data) {
    console.log('[REDIS] Webhook removed from queue');
  }
  return data;
};

export const getQueueSize = async (): Promise<number> => {
  const client = getRedisClient();
  return await client.lLen(WEBHOOK_QUEUE_KEY);
};
