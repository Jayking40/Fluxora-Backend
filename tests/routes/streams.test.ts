import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { setPauseFlags, _resetForTest } from '../../src/state/adminState.js';
import { _clearStreamsForTest } from '../../src/routes/streams.js';

describe('streams routes', () => {
  beforeEach(() => {
    _resetForTest();
    _clearStreamsForTest();
  });

  afterEach(() => {
    _resetForTest();
    _clearStreamsForTest();
  });

  describe('GET /api/streams', () => {
    it('returns an empty list by default', async () => {
      const res = await request(app).get('/api/streams');
      expect(res.status).toBe(200);
      expect(res.body.streams).toEqual([]);
    });
  });

  describe('GET /api/streams/:id', () => {
    it('returns 404 for non-existent stream', async () => {
      const res = await request(app).get('/api/streams/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns a previously created stream', async () => {
      const created = await request(app)
        .post('/api/streams')
        .send({ sender: 'GA...', recipient: 'GB...', depositAmount: '1000' });

      const res = await request(app).get(`/api/streams/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.sender).toBe('GA...');
    });
  });

  describe('POST /api/streams', () => {
    it('creates a stream with provided fields', async () => {
      const res = await request(app).post('/api/streams').send({
        sender: 'GABCDEF',
        recipient: 'GXYZ123',
        depositAmount: '5000',
        ratePerSecond: '10',
        startTime: 1700000000,
      });
      expect(res.status).toBe(201);
      expect(res.body.sender).toBe('GABCDEF');
      expect(res.body.recipient).toBe('GXYZ123');
      expect(res.body.depositAmount).toBe('5000');
      expect(res.body.ratePerSecond).toBe('10');
      expect(res.body.startTime).toBe(1700000000);
      expect(res.body.status).toBe('active');
      expect(res.body.id).toMatch(/^stream-/);
    });

    it('applies defaults for missing fields', async () => {
      const res = await request(app).post('/api/streams').send({});
      expect(res.status).toBe(201);
      expect(res.body.sender).toBe('');
      expect(res.body.depositAmount).toBe('0');
    });

    it('returns 503 when stream creation is paused', async () => {
      setPauseFlags({ streamCreation: true });
      const res = await request(app).post('/api/streams').send({
        sender: 'GA...',
        recipient: 'GB...',
      });
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/paused/i);
    });

    it('allows creation again after un-pausing', async () => {
      setPauseFlags({ streamCreation: true });
      setPauseFlags({ streamCreation: false });
      const res = await request(app).post('/api/streams').send({
        sender: 'GA...',
        recipient: 'GB...',
      });
      expect(res.status).toBe(201);
    });
  });
});
