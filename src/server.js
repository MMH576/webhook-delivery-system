require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/database');
const redis = require('./config/redis');
const logger = require('./utils/logger');
const { getQueueStats } = require('./services/webhookService');
const webhookRoutes = require('./routes/webhooks');
const apiKeyRoutes = require('./routes/apiKeys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        logger.info({
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: Date.now() - start
        }, 'request completed');
    });
    next();
});

app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
    const health = { status: 'ok', database: 'connected', redis: 'connected', queue: null };

    try {
        await db.query('SELECT 1');
    } catch {
        health.status = 'error';
        health.database = 'disconnected';
    }

    try {
        await redis.ping();
        health.queue = await getQueueStats();
    } catch {
        health.status = 'error';
        health.redis = 'disconnected';
    }

    res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.get('/health', async (req, res) => {
    const health = { status: 'ok', database: 'connected', redis: 'connected', queue: null };

    try {
        await db.query('SELECT 1');
    } catch {
        health.status = 'error';
        health.database = 'disconnected';
    }

    try {
        await redis.ping();
        health.queue = await getQueueStats();
    } catch {
        health.status = 'error';
        health.redis = 'disconnected';
    }

    res.status(health.status === 'ok' ? 200 : 500).json(health);
});

app.use('/api/webhooks', webhookRoutes);
app.use('/api/keys', apiKeyRoutes);

app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started');
});

let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    server.close(async () => {
        logger.info('HTTP server closed');

        try {
            await db.pool.end();
            logger.info('Database pool closed');
        } catch (err) {
            logger.error({ err }, 'Error closing database pool');
        }

        try {
            await redis.quit();
            logger.info('Redis connection closed');
        } catch (err) {
            logger.error({ err }, 'Error closing Redis connection');
        }

        logger.info('Shutdown complete');
        process.exit(0);
    });

    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
