import express from 'express';
import request from 'supertest';
import { recordAuditEvent, getAuditEntries, _resetAuditLog } from '../src/lib/auditLog.js';
import { auditRouter } from '../src/routes/audit.js';
import { streams, resetStreamIdempotencyStore, streamsRouter } from '../src/routes/streams.js';
import { correlationIdMiddleware } from '../src/middleware/correlationId.js';
import { authenticate } from '../src/middleware/auth.js';
import { initializeConfig, resetConfig } from '../src/config/env.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(authenticate);
  app.use('/api/audit', auditRouter);
  app.use('/api/streams', streamsRouter);
  app.use(errorHandler);
  return app;
}

describe('Audit Log Integration', () => {
  let app: any;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.API_KEYS = 'test-api-key';
    resetConfig();
    initializeConfig();
    _resetAuditLog();
    streams.length = 0;
    resetStreamIdempotencyStore();
    app = createTestApp();
  });

  const validStream = {
    sender: 'GCSX2XXXXXXXXXXXXXXXXXXXXXXX',
    recipient: 'GDRX2XXXXXXXXXXXXXXXXXXXXXXX',
    depositAmount: '1000.0000000',
    ratePerSecond: '0.0000116',
  };

  it('records an audit entry when a stream is created', async () => {
    await request(app)
      .post('/api/streams')
      .set('X-API-Key', 'test-api-key')
      .set('Idempotency-Key', 'audit-test-1')
      .send(validStream)
      .expect(201);
    const entries = getAuditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('STREAM_CREATED');
    expect(entries[0]!.meta?.depositAmount).toBe('1000.0000000');
  });

  it('records an audit entry when a stream is cancelled', async () => {
    const createRes = await request(app)
      .post('/api/streams')
      .set('X-API-Key', 'test-api-key')
      .set('Idempotency-Key', 'audit-test-2')
      .send(validStream)
      .expect(201);
    const { id } = createRes.body;
    await request(app).delete(`/api/streams/${id}`).set('X-API-Key', 'test-api-key').expect(200);
    const [_, entry] = getAuditEntries();
    expect(entry!.action).toBe('STREAM_CANCELLED');
  });
});
