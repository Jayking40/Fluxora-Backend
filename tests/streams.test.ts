import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../src/index.js';

describe('Bulk Fetch: POST /api/streams/lookup', () => {
  let streamId1: string;
  let streamId2: string;

  before(async () => {
    // Create some initial streams
    const res1 = await request(app)
      .post('/api/streams')
      .send({ sender: 'alice', recipient: 'bob', depositAmount: '100' });
    streamId1 = res1.body.id;

    const res2 = await request(app)
      .post('/api/streams')
      .send({ sender: 'charlie', recipient: 'dave', depositAmount: '200' });
    streamId2 = res2.body.id;
  });

  test('should return empty list if no IDs are provided', async () => {
    const res = await request(app)
      .post('/api/streams/lookup')
      .send({ ids: [] });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.streams, []);
  });

  test('should return found streams for valid IDs', async () => {
    const res = await request(app)
      .post('/api/streams/lookup')
      .send({ ids: [streamId1, streamId2] });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.streams.length, 2);
    assert.ok(res.body.streams.some((s: any) => s.id === streamId1));
    assert.ok(res.body.streams.some((s: any) => s.id === streamId2));
  });

  test('should omit non-existent IDs', async () => {
    const res = await request(app)
      .post('/api/streams/lookup')
      .send({ ids: [streamId1, 'non-existent'] });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.streams.length, 1);
    assert.strictEqual(res.body.streams[0].id, streamId1);
  });

  test('should return 400 for invalid input (non-array ids)', async () => {
    const res = await request(app)
      .post('/api/streams/lookup')
      .send({ ids: 'not-an-array' });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /ids must be an array/);
  });
});
