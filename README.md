# Webhook Delivery System

[![CI](https://github.com/MMH576/webhook-delivery-system/actions/workflows/ci.yml/badge.svg)](https://github.com/MMH576/webhook-delivery-system/actions/workflows/ci.yml)

A production-ready webhook delivery service with automatic retries, dead letter queue, and real-time monitoring dashboard. Built to handle high-throughput webhook deliveries with reliability guarantees.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              WEBHOOK DELIVERY SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐     ┌──────────────────────────────────────────────────────┐ │
│  │              │     │                    API SERVER                        │ │
│  │   Client     │────▶│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  Dashboard   │     │  │Rate Limiter │  │ Auth Guard  │  │  Validator  │  │ │
│  │   (React)    │◀────│  │(100 req/min)│  │ (API Keys)  │  │  (express)  │  │ │
│  │              │     │  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│  └──────────────┘     └───────────────────────────┬──────────────────────────┘ │
│                                                   │                             │
│                                                   ▼                             │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │                           MESSAGE QUEUE (Bull + Redis)                     ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐││
│  │  │  Pending Jobs   │  │  Active Jobs    │  │  Delayed Jobs (Retry Queue) │││
│  │  │                 │──│                 │──│  Exponential Backoff        │││
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                                                   │                             │
│                                                   ▼                             │
│  ┌────────────────────────────────────────────────────────────────────────────┐│
│  │                           WORKER SERVICE                                   ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐││
│  │  │ Job Processor   │  │ HMAC Signer     │  │  HTTP Client (Axios)        │││
│  │  │ (Concurrency:5) │──│ (SHA-256)       │──│  Timeout: 30s               │││
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘││
│  └────────────────────────────────────────────────────────────────────────────┘│
│                         │                                    │                  │
│                         ▼                                    ▼                  │
│  ┌──────────────────────────────────┐    ┌──────────────────────────────────┐  │
│  │        PostgreSQL Database       │    │       External Endpoints         │  │
│  │  ┌────────────┐ ┌──────────────┐ │    │                                  │  │
│  │  │  webhooks  │ │   api_keys   │ │    │   https://your-app.com/webhook  │  │
│  │  ├────────────┤ ├──────────────┤ │    │   https://partner.io/events     │  │
│  │  │ attempts   │ │     dlq      │ │    │   https://service.dev/notify    │  │
│  │  └────────────┘ └──────────────┘ │    │                                  │  │
│  └──────────────────────────────────┘    └──────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Automatic Retries** - 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Dead Letter Queue** - Failed webhooks stored for inspection and manual retry
- **API Key Authentication** - Secure SHA-256 hashed API keys
- **Rate Limiting** - Redis-backed rate limiting (100 req/min per key)
- **HMAC Signatures** - `X-Webhook-Signature` header for payload verification
- **Real-time Dashboard** - Monitor deliveries, view logs, retry failed webhooks
- **Health Checks** - Kubernetes-ready liveness and readiness probes

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20 |
| **API Framework** | Express.js 5 |
| **Database** | PostgreSQL 15 |
| **Queue/Cache** | Redis 7 + Bull |
| **Frontend** | React 19 + Vite |
| **Styling** | Tailwind CSS |
| **Testing** | Jest + Supertest |
| **Containerization** | Docker |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/MMH576/webhook-delivery-system.git
cd webhook-delivery-system

# Install dependencies
npm install

# Start PostgreSQL and Redis (Docker required)
docker-compose up -d

# Configure environment
cp .env.example .env

# Run database migrations
node scripts/migrate.js

# Start the server (Terminal 1)
npm run dev

# Start the worker (Terminal 2)
npm run worker
```

Open http://localhost:3000 to view the dashboard.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | Required |
| `PORT` | Server port | `3000` |
| `WEBHOOK_SECRET` | HMAC signing secret | Required |
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Pino log level | `info` |

## API Reference

### Authentication

All webhook endpoints require an API key in the `X-API-Key` header.

### Endpoints

#### Create API Key
```bash
POST /api/keys
Content-Type: application/json

{"name": "My Application"}

# Response: {"id": "...", "key": "wh_xxx...", "name": "My Application"}
```

#### Create Webhook
```bash
POST /api/webhooks
X-API-Key: wh_your_api_key
Content-Type: application/json

{
  "target_url": "https://example.com/webhook",
  "payload": {"event": "user.created", "data": {"id": 123}}
}
```

#### List Webhooks
```bash
GET /api/webhooks?page=1&limit=20
X-API-Key: wh_your_api_key
```

#### Get Webhook Details
```bash
GET /api/webhooks/:id
X-API-Key: wh_your_api_key
```

#### Get Delivery Attempts
```bash
GET /api/webhooks/:id/attempts
X-API-Key: wh_your_api_key
```

#### Dead Letter Queue
```bash
# List failed webhooks
GET /api/webhooks/dlq/list

# Retry a failed webhook
POST /api/webhooks/dlq/:id/retry
```

#### Health Checks
```bash
GET /health/live   # Liveness probe
GET /health/ready  # Readiness probe (checks DB + Redis)
GET /health        # Detailed health status
```

## Deployment

### Render (Recommended)

This project includes a `render.yaml` Blueprint for one-click deployment:

1. Fork this repository
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` and creates all services
5. Add `WEBHOOK_SECRET` environment variable

### Docker

```bash
# Production build
docker-compose -f docker-compose.prod.yml up -d
```

### Manual

```bash
# Build client
npm run build

# Start server
NODE_ENV=production node src/server.js

# Start worker (separate process)
NODE_ENV=production node src/workers/webhookWorker.js
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/auth.test.js
```

## Project Structure

```
├── src/
│   ├── app.js              # Express app configuration
│   ├── server.js           # Server entry point
│   ├── config/             # Database and Redis configuration
│   ├── middleware/         # Auth, rate limiting, validation
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic
│   ├── utils/              # Helpers (logger, signature)
│   └── workers/            # Background job processors
├── client/                 # React frontend
├── tests/                  # Jest test suite
├── migrations/             # Database schema
└── scripts/                # Utility scripts
```

## License

ISC
