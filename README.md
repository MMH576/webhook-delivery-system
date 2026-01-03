Webhook Delivery System

A reliable webhook delivery service with automatic retries, dead letter queue, and monitoring dashboard.

Features

- Automatic retries with exponential backoff (5 attempts)
- Dead letter queue for failed webhooks
- API key authentication
- Rate limiting (100 req/min)
- HMAC signature verification
- Real-time dashboard

Tech Stack

Node.js, Express, PostgreSQL, Redis, Bull Queue, React

Quick Start

```bash
# Install dependencies
npm install

# Start PostgreSQL and Redis
docker-compose up -d

# Configure environment
cp .env.example .env

# Run migrations
node scripts/migrate.js

# Start server and worker
npm run dev          # Terminal 1
npm run worker       # Terminal 2
```

Open http://localhost:3000

Environment Variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/webhook_db
REDIS_URL=redis://localhost:6379
PORT=3000
WEBHOOK_SECRET=your-secret-key
```

API Endpoints

Create API Key
```
POST /api/keys
Body: {"name": "My App"}
```

Create Webhook
```
POST /api/webhooks
Headers: X-API-Key: wh_your_key
Body: {
  "target_url": "https://example.com/webhook",
  "payload": {"event": "user.created"}
}
```

Other Endpoints
- `GET /api/webhooks` - List webhooks
- `GET /api/webhooks/:id` - Get webhook details
- `GET /api/webhooks/:id/attempts` - Get delivery attempts
- `GET /api/webhooks/dlq/list` - List failed webhooks
- `POST /api/webhooks/dlq/:id/retry` - Retry failed webhook
- `GET /health/ready` - Health check

Deployment (Railway)

1. Push to GitHub
2. Create project at railway.app
3. Add PostgreSQL and Redis
4. Set environment variables
5. Deploy with start command: `node src/server.js`
6. Add worker service: `node src/workers/webhookWorker.js`

Testing

```bash
npm test
```

License

ISC
