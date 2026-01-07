require('dotenv').config();
const path = require('path');
const express = require('express');
const app = require('./app');
const db = require('./config/database');
const redis = require('./config/redis');
const logger = require('./utils/logger');

// Start the worker in the same process (for free tier hosting)
require('./workers/webhookWorker');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started with integrated worker');
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
