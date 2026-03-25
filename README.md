# Fluxora Backend

Express + TypeScript API for the Fluxora treasury streaming protocol. Provides REST endpoints for streams, health checks, and (later) Horizon sync and analytics.

## What's in this repo

- **API Gateway** — REST API for stream CRUD and health
- **Streams API** — List, get, and create stream records (in-memory placeholder; will be replaced by PostgreSQL + Horizon listener)
- Ready to extend with JWT, RBAC, rate limiting, and streaming engine

## Tech stack

- Node.js 18+
- TypeScript
- Express

## Local setup

### Prerequisites

- Node.js 18+
- npm or pnpm

### Install and run

```bash
npm install
npm run dev
```

API runs at [http://localhost:3000](http://localhost:3000).

### Scripts

- `npm run dev` — Run with tsx watch (no build)
- `npm run build` — Compile to `dist/`
- `npm start` — Run compiled `dist/index.js`

## API overview

| Method | Path                 | Auth  | Description |
|--------|----------------------|-------|-------------|
| GET    | `/`                  | —     | API info |
| GET    | `/health`            | —     | Health check |
| GET    | `/api/streams`       | —     | List streams |
| GET    | `/api/streams/:id`   | —     | Get one stream |
| POST   | `/api/streams`       | —     | Create stream (body: sender, recipient, depositAmount, ratePerSecond, startTime) |
| GET    | `/api/admin/status`  | Admin | Pause flags + reindex state |
| GET    | `/api/admin/pause`   | Admin | Read current pause flags |
| PUT    | `/api/admin/pause`   | Admin | Update pause flags (body: streamCreation?, ingestion?) |
| GET    | `/api/admin/reindex` | Admin | Reindex job status |
| POST   | `/api/admin/reindex` | Admin | Trigger a reindex (202 accepted, 409 if running) |

All responses are JSON. Stream data is in-memory until you add PostgreSQL.

### Admin authentication

Admin routes require a `Bearer` token in the `Authorization` header that matches the `ADMIN_API_KEY` environment variable. When the variable is unset, all admin endpoints return `503` (fail-closed).

```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" http://localhost:3000/api/admin/status
```

## Project structure

```
src/
  middleware/ # adminAuth
  routes/     # health, streams, admin
  state/      # adminState (pause flags, reindex tracking)
  app.ts      # Express app setup
  index.ts    # Server entry point
tests/
  middleware/ # adminAuth tests
  routes/     # admin, health, streams tests
  state/      # adminState tests
```

## Environment

Optional:

- `PORT` — Server port (default: 3000)
- `ADMIN_API_KEY` — Bearer token for admin routes (required to enable admin access)

Later you can add `DATABASE_URL`, `REDIS_URL`, `HORIZON_URL`, `JWT_SECRET`, etc.

## Related repos

- **fluxora-frontend** — Dashboard and recipient UI
- **fluxora-contracts** — Soroban smart contracts

Each is a separate Git repository.
