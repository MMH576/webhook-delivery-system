require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/database');
const redis = require('./config/redis');
const { getQueueStats } = require('./services/webhookService');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

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

app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
