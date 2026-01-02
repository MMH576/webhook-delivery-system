const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');

function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey() {
    return 'wh_' + crypto.randomBytes(24).toString('hex');
}

async function authMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ error: 'Missing X-API-Key header' });
    }

    try {
        const keyHash = hashApiKey(apiKey);
        const result = await db.query(
            'SELECT id, name, is_active FROM api_keys WHERE key_hash = $1',
            [keyHash]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        const apiKeyRecord = result.rows[0];

        if (!apiKeyRecord.is_active) {
            return res.status(403).json({ error: 'API key is disabled' });
        }

        await db.query(
            'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
            [apiKeyRecord.id]
        );

        req.apiKeyId = apiKeyRecord.id;
        req.apiKeyName = apiKeyRecord.name;
        next();
    } catch (error) {
        logger.error({ err: error }, 'Auth middleware error');
        res.status(500).json({ error: 'Authentication failed' });
    }
}

async function createApiKey(name) {
    const key = generateApiKey();
    const keyHash = hashApiKey(key);

    const result = await db.query(
        `INSERT INTO api_keys (name, key_hash) VALUES ($1, $2) RETURNING id, name, created_at`,
        [name, keyHash]
    );

    return {
        ...result.rows[0],
        key
    };
}

async function listApiKeys() {
    const result = await db.query(
        'SELECT id, name, created_at, last_used_at, is_active FROM api_keys ORDER BY created_at DESC'
    );
    return result.rows;
}

async function revokeApiKey(id) {
    await db.query('UPDATE api_keys SET is_active = false WHERE id = $1', [id]);
}

module.exports = {
    authMiddleware,
    createApiKey,
    listApiKeys,
    revokeApiKey,
    hashApiKey,
    generateApiKey
};
