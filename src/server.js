require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/database');
const redis = require('./config/redis');
const { getQueueStats } = require('./services/webhookService');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Webhook Delivery System API', endpoints: ['/health', '/api/webhooks'] });
});

app.get('/health', async (req, res) => {
    const health = { status: 'ok', database: 'connected', redis: 'connected', queue: null };

    try {
        await db.query('SELECT 1');
    } catch (error) {
        health.status = 'error';
        health.database = 'disconnected';
    }

    try {
        await redis.ping();
        health.queue = await getQueueStats();
    } catch (error) {
        health.status = 'error';
        health.redis = 'disconnected';
    }

    res.status(health.status === 'ok' ? 200 : 500).json(health);
});

app.use('/api/webhooks', webhookRoutes);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
