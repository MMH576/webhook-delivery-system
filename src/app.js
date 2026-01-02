require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

if (process.env.NODE_ENV !== 'test') {
    const logger = require('./utils/logger');
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
}

app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
    const db = require('./config/database');
    const redis = require('./config/redis');
    const { getQueueStats } = require('./services/webhookService');

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
    const db = require('./config/database');
    const redis = require('./config/redis');
    const { getQueueStats } = require('./services/webhookService');

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

app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/keys', require('./routes/apiKeys'));

if (process.env.NODE_ENV !== 'test') {
    app.use(express.static(path.join(__dirname, '../public')));
    app.get('/{*splat}', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });
}

module.exports = app;
