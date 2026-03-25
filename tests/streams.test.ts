import request from 'supertest';
import { app } from '../src/app';
import { CORRELATION_ID_HEADER } from '../src/middleware/correlationId';

describe('streams API', () => {
  describe('GET /api/streams', () => {
    it('returns 200 with a streams array', async () => {
      const res = await request(app).get('/api/streams');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.streams)).toBe(true);
    });

    it('includes x-correlation-id header', async () => {
      const res = await request(app).get('/api/streams');
      expect(res.headers[CORRELATION_ID_HEADER]).toBeDefined();
    });
  });

  describe('POST /api/streams', () => {
    const validPayload = {
      sender: 'GABC',
      recipient: 'GXYZ',
      depositAmount: '1000',
      ratePerSecond: '1',
      startTime: 1700000000,
    };

    it('returns 201 with the created stream', async () => {
      const res = await request(app).post('/api/streams').send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.sender).toBe('GABC');
      expect(res.body.recipient).toBe('GXYZ');
      expect(res.body.status).toBe('active');
    });

    it('includes x-correlation-id header on creation', async () => {
      const res = await request(app).post('/api/streams').send(validPayload);
      expect(res.headers[CORRELATION_ID_HEADER]).toBeDefined();
    });

    it('propagates client correlation ID on creation', async () => {
      const id = 'post-stream-id';
      const res = await request(app)
        .post('/api/streams')
        .set(CORRELATION_ID_HEADER, id)
        .send(validPayload);
      expect(res.headers[CORRELATION_ID_HEADER]).toBe(id);
    });

    it('handles missing body fields with defaults', async () => {
      const res = await request(app).post('/api/streams').send({});
      expect(res.status).toBe(201);
      expect(res.body.depositAmount).toBe('0');
      expect(res.body.ratePerSecond).toBe('0');
    });
  });

  describe('GET /api/streams/:id', () => {
    it('returns 404 for unknown stream id', async () => {
      const res = await request(app).get('/api/streams/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('returns 404 with x-correlation-id header', async () => {
      const res = await request(app).get('/api/streams/does-not-exist');
      expect(res.headers[CORRELATION_ID_HEADER]).toBeDefined();
    });

    it('returns the created stream by id', async () => {
      const created = await request(app).post('/api/streams').send({
        sender: 'S1',
        recipient: 'R1',
        depositAmount: '500',
        ratePerSecond: '2',
        startTime: 0,
      });
      const { id } = created.body as { id: string };

      const res = await request(app).get(`/api/streams/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.sender).toBe('S1');
    });
  });
});
