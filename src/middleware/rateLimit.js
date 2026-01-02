const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const redis = require('../config/redis');
const logger = require('../utils/logger');

const apiLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args)
    }),
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        if (req.apiKeyId) {
            return req.apiKeyId;
        }
        return req.ip;
    },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    handler: (req, res) => {
        logger.warn({ apiKeyId: req.apiKeyId, ip: req.ip }, 'Rate limit exceeded');
        res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(60)
        });
    }
});

const strictLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args)
    }),
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded for this endpoint.'
        });
    }
});

module.exports = { apiLimiter, strictLimiter };
