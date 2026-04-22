import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookService } from '../src/webhooks/service.js';
import { webhookDeliveryStore } from '../src/webhooks/store.js';
import type { WebhookEvent } from '../src/webhooks/types.js';
import {
  computeWebhookSignature,
  verifyWebhookSignature,
} from '../src/webhooks/signature.js';
import { recordAuditEvent, getAuditEntries, _resetAuditLog } from '../src/lib/auditLog.js';

// Mock fetch for testing
const originalFetch = global.fetch;
let mockFetchResponses: Map<string, Response> = new Map();

function mockFetch(url: string, options?: RequestInit): Promise<Response> {
  const response = mockFetchResponses.get(url);
  if (response) {
    return Promise.resolve(response.clone());
  }
  return Promise.reject(new Error(`No mock response for ${url}`));
}

describe('WebhookService', () => {
  beforeEach(() => {
    global.fetch = mockFetch as any;
    webhookDeliveryStore.clear();
    mockFetchResponses.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('queues a webhook delivery', async () => {
    const service = new WebhookService();

    const event: WebhookEvent = {
      id: 'event_123',
      type: 'stream.created',
      timestamp: Date.now(),
      data: { streamId: 'stream_123' },
    };

    const delivery = await service.queueDelivery(
      event,
      'https://example.com/webhook',
      'secret123',
    );

    expect(delivery.status).toBe('pending');
    expect(delivery.eventId).toBe(event.id);
    expect(delivery.eventType).toBe(event.type);
    expect(delivery.deliveryId.startsWith('deliv_')).toBe(true);
  });

  it('tracks delivery attempts', async () => {
    const service = new WebhookService();

    mockFetchResponses.set('https://example.com/webhook', new Response(null, { status: 200 }));

    const event: WebhookEvent = {
      id: 'event_456',
      type: 'stream.updated',
      timestamp: Date.now(),
      data: { streamId: 'stream_456' },
    };

    const delivery = await service.queueDelivery(
      event,
      'https://example.com/webhook',
      'secret123',
    );

    expect(delivery.attempts.length).toBe(1);
    expect(delivery.attempts[0].attemptNumber).toBe(1);
    expect(delivery.attempts[0].statusCode).toBe(200);
  });

  it('marks delivery as delivered on 2xx response', async () => {
    const service = new WebhookService();

    mockFetchResponses.set('https://example.com/webhook', new Response(null, { status: 200 }));

    const event: WebhookEvent = {
      id: 'event_789',
      type: 'stream.created',
      timestamp: Date.now(),
      data: { streamId: 'stream_789' },
    };

    const delivery = await service.queueDelivery(
      event,
      'https://example.com/webhook',
      'secret123',
    );

    expect(delivery.status).toBe('delivered');
  });

  it('retries on 5xx response', async () => {
    const service = new WebhookService();

    mockFetchResponses.set('https://example.com/webhook', new Response(null, { status: 503 }));

    const event: WebhookEvent = {
      id: 'event_retry',
      type: 'stream.created',
      timestamp: Date.now(),
      data: { streamId: 'stream_retry' },
    };

    const delivery = await service.queueDelivery(
      event,
      'https://example.com/webhook',
      'secret123',
    );

    expect(delivery.status).toBe('pending');
    expect(delivery.attempts.length).toBe(1);
    expect(delivery.attempts[0].statusCode).toBe(503);
    expect(delivery.attempts[0].nextRetryAt).toBeDefined();
  });

  it('does not retry on 4xx response', async () => {
    const service = new WebhookService();

    mockFetchResponses.set('https://example.com/webhook', new Response(null, { status: 404 }));

    const event: WebhookEvent = {
      id: 'event_404',
      type: 'stream.created',
      timestamp: Date.now(),
      data: { streamId: 'stream_404' },
    };

    const delivery = await service.queueDelivery(
      event,
      'https://example.com/webhook',
      'secret123',
    );

    expect(delivery.status).toBe('permanent_failure');
    expect(delivery.attempts.length).toBe(1);
    expect(delivery.attempts[0].statusCode).toBe(404);
  });

  it('respects max attempts', async () => {
    const policy = {
      maxAttempts: 2,
      initialBackoffMs: 100,
      backoffMultiplier: 2,
      maxBackoffMs: 1000,
      jitterPercent: 0,
      timeoutMs: 5000,
      retryableStatusCodes: [500, 502, 503, 504, 408, 429],
    };
    const service = new WebhookService(policy);

    mockFetchResponses.set('https://example.com/webhook', new Response(null, { status: 503 }));

    const event: WebhookEvent = {
      id: 'event_max_attempts',
      type: 'stream.created',
      timestamp: Date.now(),
      data: { streamId: 'stream_max' },
    };

    let delivery = await service.queueDelivery(
      event,
      'https://example.com/webhook',
      'secret123',
    );

    expect(delivery.attempts.length).toBe(1);
    expect(delivery.status).toBe('pending');

    // Simulate retry
    const deliveryId = delivery.deliveryId;
    delivery = webhookDeliveryStore.getByDeliveryId(deliveryId)!;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    await service.attemptDelivery(delivery, 'secret123', timestamp);

    expect(delivery.attempts.length).toBe(2);
    expect(delivery.status).toBe('permanent_failure');
  });

  it('sends correct headers', async () => {
    const service = new WebhookService();

    let capturedRequest: RequestInit | undefined;
    const originalFetch2 = global.fetch;
    global.fetch = async (url: string, options?: RequestInit) => {
      capturedRequest = options;
      return new Response(null, { status: 200 });
    };

    try {
      const event: WebhookEvent = {
        id: 'event_headers',
        type: 'stream.created',
        timestamp: Date.now(),
        data: { streamId: 'stream_headers' },
      };

      await service.queueDelivery(
        event,
        'https://example.com/webhook',
        'secret123',
      );

      expect(capturedRequest).toBeDefined();
      const headers = capturedRequest!.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['x-fluxora-delivery-id']).toBeDefined();
      expect(headers['x-fluxora-timestamp']).toBeDefined();
      expect(headers['x-fluxora-signature']).toBeDefined();
    } finally {
      global.fetch = originalFetch2;
    }
  });

  it('deduplicates deliveries', async () => {
    const service = new WebhookService();
    const deliveryId = 'test_dedup_id';

    // Initially should not be a duplicate
    expect(service.isDuplicateDelivery(deliveryId)).toBe(false);

    const event: WebhookEvent = {
      id: 'event_dedup',
      type: 'stream.created',
      timestamp: Date.now(),
      data: { streamId: 'stream_dedup' },
    };

    // This stores the delivery
    const delivery1 = await service.queueDelivery(
      event,
      'https://example.com/webhook',
      'secret123',
    );

    // Now it should be detected as duplicate
    expect(service.isDuplicateDelivery(delivery1.deliveryId)).toBe(true);
  });
});

describe('webhook secret rotation (dual-valid window)', () => {
  const rawBody = '{"event":"stream.created"}';
  const timestamp = '1710000000';
  const now = 1710000000;

  it('accepts a signature made with the current secret', () => {
    const sig = computeWebhookSignature('new-secret', timestamp, rawBody);
    const result = verifyWebhookSignature({
      secret: 'new-secret',
      secretPrevious: 'old-secret',
      deliveryId: 'deliv_1',
      timestamp,
      signature: sig,
      rawBody,
      now,
    });
    expect(result.ok).toBe(true);
    expect(result.usedPreviousSecret).toBeUndefined();
  });

  it('accepts a signature made with the previous secret during rotation window', () => {
    const sig = computeWebhookSignature('old-secret', timestamp, rawBody);
    const result = verifyWebhookSignature({
      secret: 'new-secret',
      secretPrevious: 'old-secret',
      deliveryId: 'deliv_2',
      timestamp,
      signature: sig,
      rawBody,
      now,
    });
    expect(result.ok).toBe(true);
    expect(result.usedPreviousSecret).toBe(true);
  });

  it('rejects when signature matches neither secret', () => {
    const sig = computeWebhookSignature('totally-wrong', timestamp, rawBody);
    const result = verifyWebhookSignature({
      secret: 'new-secret',
      secretPrevious: 'old-secret',
      deliveryId: 'deliv_3',
      timestamp,
      signature: sig,
      rawBody,
      now,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('signature_mismatch');
  });

  it('rejects when no previous secret is set and signature uses an old key', () => {
    const sig = computeWebhookSignature('old-secret', timestamp, rawBody);
    const result = verifyWebhookSignature({
      secret: 'new-secret',
      deliveryId: 'deliv_4',
      timestamp,
      signature: sig,
      rawBody,
      now,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('signature_mismatch');
  });

  it('still enforces timestamp tolerance with dual secrets', () => {
    const sig = computeWebhookSignature('old-secret', timestamp, rawBody);
    const result = verifyWebhookSignature({
      secret: 'new-secret',
      secretPrevious: 'old-secret',
      deliveryId: 'deliv_5',
      timestamp,
      signature: sig,
      rawBody,
      now: 1710000000 + 9999, // way outside tolerance
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('timestamp_outside_tolerance');
  });

  it('still detects duplicate deliveries with dual secrets', () => {
    const sig = computeWebhookSignature('old-secret', timestamp, rawBody);
    const result = verifyWebhookSignature({
      secret: 'new-secret',
      secretPrevious: 'old-secret',
      deliveryId: 'deliv_dup_rotation',
      timestamp,
      signature: sig,
      rawBody,
      now,
      isDuplicateDelivery: () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('duplicate_delivery');
  });
});

describe('audit log — WEBHOOK_SECRET_ROTATED', () => {
  beforeEach(() => _resetAuditLog());

  it('records a rotation event', () => {
    recordAuditEvent('WEBHOOK_SECRET_ROTATED', 'webhook', 'global', 'corr-abc', {
      rotatedBy: 'admin',
    });
    const entries = getAuditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('WEBHOOK_SECRET_ROTATED');
    expect(entries[0].resourceType).toBe('webhook');
    expect(entries[0].correlationId).toBe('corr-abc');
    expect(entries[0].meta?.rotatedBy).toBe('admin');
  });

  it('seq increments across rotation events', () => {
    recordAuditEvent('WEBHOOK_SECRET_ROTATED', 'webhook', 'global');
    recordAuditEvent('WEBHOOK_SECRET_ROTATED', 'webhook', 'global');
    const entries = getAuditEntries();
    expect(entries[0].seq).toBe(1);
    expect(entries[1].seq).toBe(2);
  });
});
