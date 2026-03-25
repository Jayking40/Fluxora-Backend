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
- `npm test` — Run tests with vitest
- `npm run test:coverage` — Run tests with coverage report

## API overview

| Method | Path                    | Description        |
|--------|-------------------------|--------------------|
| GET    | `/`                     | API info           |
| GET    | `/health`               | Health check       |
| GET    | `/api/streams`          | List streams       |
| GET    | `/api/streams/:id`      | Get one stream     |
| POST   | `/api/streams`          | Create stream (body: sender, recipient, depositAmount, ratePerSecond, startTime) |
| GET    | `/api/privacy/policy`   | Full PII policy document (field classifications, retention, trust boundaries) |
| GET    | `/api/privacy/retention`| Retention schedule  |

All responses are JSON. Stream data is in-memory until you add PostgreSQL.

### Input validation

`POST /api/streams` validates all fields before accepting a record:

- `sender` and `recipient` must be valid Stellar public keys (`G…`, 56 characters, base-32 alphabet).
- `depositAmount` and `ratePerSecond` must be positive numeric strings.
- `startTime` (optional) must be a non-negative number.

Invalid requests receive a `400` response with an `error` and `details` array describing every failing field.

## Project structure

```
src/
  app.ts          # Express app factory (testable without binding a port)
  index.ts        # Server bootstrap
  pii/
    policy.ts     # Data classification, retention schedule, trust boundaries
    sanitizer.ts  # PII redaction and Stellar key masking utilities
  logging/
    logger.ts     # Structured, PII-safe JSON logger
  middleware/
    pii.ts        # Privacy headers, request logger, safe error handler
  routes/
    health.ts     # Health check
    streams.ts    # Stream CRUD with input validation
    privacy.ts    # Machine-readable PII policy endpoints
tests/
  pii/            # Policy and sanitizer tests
  logging/        # Logger tests
  middleware/     # Middleware tests
  routes/         # Route integration tests (privacy, streams)
```

## Environment

Optional:

- `PORT` — Server port (default: 3000)

Later you can add `DATABASE_URL`, `REDIS_URL`, `HORIZON_URL`, `JWT_SECRET`, etc.

## PII policy

Fluxora stores only **chain-derived pseudonymous data** (Stellar public keys and on-chain amounts). No direct PII such as names, emails, or physical addresses is collected.

### Data classification

| Level        | Description |
|--------------|-------------|
| PUBLIC       | Freely shareable (health status, timestamps, stream status). |
| INTERNAL     | Operational data visible to authenticated users (stream IDs, amounts). |
| SENSITIVE    | Pseudonymous identifiers correlatable to real identities (Stellar public keys). Redacted in logs. |
| RESTRICTED   | Credentials or direct PII (IP addresses, auth tokens). Never persisted, never logged. |

### Retention schedule

| Category                   | Retention       | Storage layer                    |
|----------------------------|-----------------|----------------------------------|
| Stream records (chain-derived) | Indefinite  | In-memory (future: PostgreSQL)   |
| HTTP request metadata      | Request lifetime | Ephemeral (process memory)       |
| Application logs           | 30 days         | stdout / log aggregator          |
| Authentication tokens      | Request lifetime | Ephemeral (process memory)       |

### Trust boundaries

- **Anonymous client** — May read streams, health, and privacy policy. May not create or mutate records.
- **Authenticated partner** — May create streams and read own history. May not access admin endpoints.
- **Administrator** — May view metrics and trigger reconciliation. May not bypass PII redaction.
- **Internal worker** — May write chain-derived records and emit logs. May not serve HTTP or access tokens.

### Observability

- All log output is structured JSON with PII fields automatically redacted.
- The `GET /api/privacy/policy` endpoint exposes the full policy for integrators and auditors.
- Every HTTP response includes `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and an `X-Privacy-Policy` header pointing to the policy endpoint.
- The safe error handler returns generic `500` responses — internal details never leak to clients.

## Related repos

- **fluxora-frontend** — Dashboard and recipient UI
- **fluxora-contracts** — Soroban smart contracts

Each is a separate Git repository.
