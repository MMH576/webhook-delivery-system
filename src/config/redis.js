const Redis = require('ioredis');
require('dotenv').config();

const redisOptions = {
    maxRetriesPerRequest: null, // Required for Bull queue compatibility
    enableReadyCheck: false,
    retryStrategy: (times) => {
        if (times > 10) {
            console.error('Redis: Max retry attempts reached');
            return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 2000);
        console.log(`Redis: Retrying connection in ${delay}ms (attempt ${times})`);
        return delay;
    },
    reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        if (targetErrors.some(e => err.message.includes(e))) {
            return true; // Reconnect on these errors
        }
        return false;
    }
};

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', redisOptions);

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.error('Redis error:', err.message));
redis.on('reconnecting', () => console.log('Redis: Reconnecting...'));

module.exports = redis;
