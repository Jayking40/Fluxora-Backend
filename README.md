# Fluxora Backend

Express + TypeScript API for the Fluxora treasury streaming protocol. Provides REST endpoints for streams, health checks, and (later) Horizon sync and analytics.

## Decimal String Serialization Policy

All amounts crossing the chain/API boundary are serialized as **decimal strings** to prevent precision loss in JSON.

### Amount Fields

- `depositAmount` - Total deposit as decimal string (e.g., "1000000.0000000")
- `ratePerSecond` - Streaming rate as decimal string (e.g., "0.0000116")

### Validation Rules

- Amounts MUST be strings in decimal notation (e.g., "100", "-50", "0.0000001")
- Native JSON numbers are rejected to prevent floating-point precision issues
- Values exceeding safe integer ranges are rejected with `DECIMAL_OUT_OF_RANGE` error

### Error Codes

| Code                     | Description                               |
| ------------------------ | ----------------------------------------- |
| `DECIMAL_INVALID_TYPE`   | Amount was not a string                   |
| `DECIMAL_INVALID_FORMAT` | String did not match decimal pattern      |
| `DECIMAL_OUT_OF_RANGE`   | Value exceeds maximum supported precision |
| `DECIMAL_EMPTY_VALUE`    | Amount was empty or null                  |

### Trust Boundaries

| Actor                  | Capabilities                               |
| ---------------------- | ------------------------------------------ |
| Public Clients         | Read streams, submit valid decimal strings |
| Authenticated Partners | Create streams with validated amounts      |
| Administrators         | Full access, diagnostic logging            |
| Internal Workers       | Database operations, chain interactions    |

### Failure Modes

| Scenario                 | Behavior                          |
| ------------------------ | --------------------------------- |
| Invalid decimal type     | 400 with `DECIMAL_INVALID_TYPE`   |
| Malformed decimal string | 400 with `DECIMAL_INVALID_FORMAT` |
| Precision overflow       | 400 with `DECIMAL_OUT_OF_RANGE`   |
| Missing required field   | 400 with `VALIDATION_ERROR`       |
| Stream not found         | 404 with `NOT_FOUND`              |

### Operational Notes

#### Diagnostic Logging

Serialization events are logged with context for debugging:

```
Decimal validation failed {"field":"depositAmount","errorCode":"DECIMAL_INVALID_TYPE","requestId":"..."}
```

#### Health Observability

- `GET /health` - Returns service health status
- Request IDs enable correlation across logs
- Structured JSON logs for log aggregation systems

#### Verification Commands

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Build TypeScript
npm run build

# Start server
npm start
```

### Known Limitations

- In-memory stream storage (production requires database integration)
- No Stellar RPC integration (placeholder for chain interactions)
- Rate limiting not implemented (future enhancement)

## Audit Log

Sensitive state-changing operations are recorded in an append-only in-memory audit log.

### Audited Actions

| Action             | Trigger                        |
| ------------------ | ------------------------------ |
| `STREAM_CREATED`   | `POST /api/streams` succeeds   |
| `STREAM_CANCELLED` | `DELETE /api/streams/:id` succeeds |

### Entry Shape

```json
{
  "seq": 1,
  "timestamp": "2026-03-26T11:00:00.000Z",
  "action": "STREAM_CREATED",
  "resourceType": "stream",
  "resourceId": "stream-1234",
  "correlationId": "x-correlation-id from request",
  "meta": {
    "sender": "GCSX2...",
    "recipient": "GDRX2...",
    "depositAmount": "1000.0000000",
    "ratePerSecond": "0.0000116"
  }
}
```

### Trust Boundaries

| Actor                  | Access                                      |
| ---------------------- | ------------------------------------------- |
| Public clients         | No access to audit log                      |
| Authenticated partners | No access to audit log                      |
| Administrators         | `GET /api/audit` — read all entries         |
| Internal workers       | Call `recordAuditEvent` directly            |

### Failure Modes

| Scenario                        | Behavior                                              |
| ------------------------------- | ----------------------------------------------------- |
| Audit write fails internally    | Error logged to stderr; primary operation unaffected  |
| No entries recorded yet         | `GET /api/audit` returns `{ entries: [], total: 0 }` |
| Stream creation fails validation | No audit entry recorded                              |

### API

```
GET /api/audit
```

Response: `{ entries: AuditEntry[], total: number }`

### Operational Notes

- Entries are append-only within the process lifetime; `seq` is monotonically increasing.
- `correlationId` is propagated from the `x-correlation-id` request header into each entry, enabling cross-log tracing.
- Audit events are emitted as structured JSON log lines at `info` level: `Audit event recorded { action, resourceType, resourceId }`.

### Non-goals (follow-up)

- Persistent storage (PostgreSQL audit table) — tracked as future work.
- Pagination / filtering on `GET /api/audit`.
- Tamper-evidence / cryptographic chaining of entries.
- Authorization enforcement on `GET /api/audit` (requires auth middleware, not yet implemented).

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

| Method | Path               | Description                                                                      |
| ------ | ------------------ | -------------------------------------------------------------------------------- |
| GET    | `/`                | API info                                                                         |
| GET    | `/health`          | Health check                                                                     |
| GET    | `/api/streams`     | List streams                                                                     |
| GET    | `/api/streams/:id` | Get one stream                                                                   |
| POST   | `/api/streams`     | Create stream (body: sender, recipient, depositAmount, ratePerSecond, startTime) |

All responses are JSON. Stream data is in-memory until you add PostgreSQL.

## Project structure

```
src/
  routes/     # health, streams
  index.ts    # Express app and server
```

## Environment

Optional:

- `PORT` — Server port (default: 3000)

Later you can add `DATABASE_URL`, `REDIS_URL`, `HORIZON_URL`, `JWT_SECRET`, etc.

## Related repos

- **fluxora-frontend** — Dashboard and recipient UI
- **fluxora-contracts** — Soroban smart contracts

Each is a separate Git repository.
