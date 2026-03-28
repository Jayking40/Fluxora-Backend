import { Router, Request, Response } from 'express';
import {
  validateDecimalString,
  validateAmountFields,
} from '../serialization/decimal.js';

import {
  ApiError,
  ApiErrorCode,
  notFound,
  validationError,
  serviceUnavailable,
  asyncHandler,
} from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { SerializationLogger, info, debug, warn, error } from '../utils/logger.js';
import { successResponse } from '../utils/response.js';
import { recordAuditEvent } from '../lib/auditLog.js';
import { dispatchWebhook } from '../webhooks/dispatcher.js';
import { getConfig } from '../config/env.js';

/**
 * Streams API routes.
 */
export const streamsRouter = Router();

// Amount fields that must be decimal strings per serialization policy
const AMOUNT_FIELDS = ['depositAmount', 'ratePerSecond'] as const;

// In-memory stream store (placeholder for DB integration)
export interface Stream {
  id: string;
  sender: string;
  recipient: string;
  depositAmount: string;
  ratePerSecond: string;
  startTime: number;
  endTime: number;
  status: string;
}

// In-memory stream store — placeholder until PostgreSQL integration lands
export const streams: Stream[] = [];

type StreamsCursor = {
  v: 1;
  lastId: string;
};

type StreamListingDependencyState = 'healthy' | 'unavailable';
type IdempotencyDependencyState = 'healthy' | 'unavailable';

type NormalizedCreateStreamInput = {
  sender: string;
  recipient: string;
  depositAmount: string;
  ratePerSecond: string;
  startTime: number;
  endTime: number;
};

type StoredIdempotentResponse = {
  requestFingerprint: string;
  statusCode: number;
  body: {
    id: string;
    sender: string;
    recipient: string;
    depositAmount: string;
    ratePerSecond: string;
    startTime: number;
    endTime: number;
    status: string;
  };
};

const streamListingDependency = {
  state: 'healthy' as StreamListingDependencyState,
};

const idempotencyDependency = {
  state: 'healthy' as IdempotencyDependencyState,
};

const idempotencyStore = new Map<string, StoredIdempotentResponse>();

export function setStreamListingDependencyState(state: StreamListingDependencyState): void {
  streamListingDependency.state = state;
}

export function setIdempotencyDependencyState(state: IdempotencyDependencyState): void {
  idempotencyDependency.state = state;
}

export function resetStreamIdempotencyStore(): void {
  idempotencyStore.clear();
}

function encodeCursor(lastId: string): string {
  const payload: StreamsCursor = { v: 1, lastId };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): StreamsCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw validationError('cursor must be a valid opaque pagination token');
  }
  return parsed as StreamsCursor;
}

function parseLimit(limitParam: unknown): number {
  if (limitParam === undefined) {
    return 50;
  }
  const parsedLimit = Number.parseInt(limitParam as string, 10);
  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw validationError('limit must be an integer between 1 and 100');
  }
  return parsedLimit;
}

function parseCursor(cursorParam: unknown): StreamsCursor | undefined {
  if (cursorParam === undefined) {
    return undefined;
  }
  return decodeCursor(cursorParam as string);
}

function parseIncludeTotal(includeTotalParam: unknown): boolean {
  if (includeTotalParam === undefined) {
    return false;
  }
  return includeTotalParam === 'true';
}

function parseIdempotencyKey(headerValue: unknown): string {
  if (typeof headerValue !== 'string' || headerValue.trim().length === 0) {
    throw validationError('Idempotency-Key header is required for unsafe POST operations');
  }
  return headerValue.trim();
}

function normalizeCreateStreamInput(body: Record<string, unknown>): NormalizedCreateStreamInput {
  const { sender, recipient, depositAmount, ratePerSecond, startTime, endTime } = body;

  if (typeof sender !== 'string' || sender.trim() === '') {
    throw validationError('sender must be a non-empty string');
  }

  if (typeof recipient !== 'string' || recipient.trim() === '') {
    throw validationError('recipient must be a non-empty string');
  }

  const depositResult = validateDecimalString(depositAmount, 'depositAmount');
  const validatedDepositAmount = depositResult.valid && depositResult.value ? depositResult.value : '0';

  if (parseFloat(validatedDepositAmount) <= 0) {
    throw validationError('depositAmount must be greater than zero');
  }

  const rateResult = validateDecimalString(ratePerSecond, 'ratePerSecond');
  const validatedRatePerSecond = rateResult.valid && rateResult.value ? rateResult.value : '0';

  if (parseFloat(validatedRatePerSecond) < 0) {
    throw validationError('ratePerSecond cannot be negative');
  }

  return {
    sender: sender.trim(),
    recipient: recipient.trim(),
    depositAmount: validatedDepositAmount,
    ratePerSecond: validatedRatePerSecond,
    startTime: typeof startTime === 'number' ? startTime : Math.floor(Date.now() / 1000),
    endTime: typeof endTime === 'number' ? endTime : 0,
  };
}

function fingerprintCreateStreamInput(input: NormalizedCreateStreamInput): string {
  return JSON.stringify(input);
}

/**
 * GET /api/streams
 * List streams with cursor-based pagination
 */
streamsRouter.get(
  '/',
  asyncHandler(async (req: any, res: any) => {
    const requestId = (req as { id?: string }).id;
    const limit = parseLimit(req.query.limit);
    const cursor = parseCursor(req.query.cursor);
    const includeTotal = parseIncludeTotal(req.query.include_total);

    if (streamListingDependency.state !== 'healthy') {
      throw serviceUnavailable('Stream list is temporarily unavailable.');
    }

    const sortedStreams = [...streams].sort((a, b) => a.id.localeCompare(b.id));
    const startIndex = cursor ? sortedStreams.findIndex((stream) => stream.id > cursor.lastId) : 0;
    const pageStreams = sortedStreams.slice(startIndex === -1 ? sortedStreams.length : startIndex, (startIndex === -1 ? sortedStreams.length : startIndex) + limit);
    const hasMore = (startIndex === -1 ? sortedStreams.length : startIndex) + pageStreams.length < sortedStreams.length;
    const nextCursor = hasMore && pageStreams[pageStreams.length - 1] ? encodeCursor(pageStreams[pageStreams.length - 1]!.id) : undefined;

    res.json({
      streams: pageStreams,
      has_more: hasMore,
      total: includeTotal ? sortedStreams.length : undefined,
      next_cursor: nextCursor
    });
  })
);

/**
 * POST /api/streams
 * Create a new stream
 */
streamsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const requestId = (req as { id?: string }).id;
    const idempotencyKey = parseIdempotencyKey(req.header('Idempotency-Key'));

    if (idempotencyDependency.state !== 'healthy') {
      throw serviceUnavailable('Idempotency processing is temporarily unavailable.');
    }

    const normalizedInput = normalizeCreateStreamInput(req.body ?? {});
    const requestFingerprint = fingerprintCreateStreamInput(normalizedInput);
    const existingResponse = idempotencyStore.get(idempotencyKey);

    if (existingResponse) {
      if (existingResponse.requestFingerprint !== requestFingerprint) {
        throw new ApiError(ApiErrorCode.CONFLICT, 'Idempotency-Key has already been used for a different request payload', 409);
      }
      res.set('Idempotency-Key', idempotencyKey);
      res.set('Idempotency-Replayed', 'true');
      res.status(existingResponse.statusCode).json(existingResponse.body);
      return;
    }

    const id = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const stream = {
      id,
      ...normalizedInput,
      status: 'active',
    };

    streams.push(stream);
    idempotencyStore.set(idempotencyKey, {
      requestFingerprint,
      statusCode: 201,
      body: stream,
    });

    recordAuditEvent('STREAM_CREATED', 'stream', id, req.correlationId, {
      depositAmount: normalizedInput.depositAmount,
      ratePerSecond: normalizedInput.ratePerSecond,
    });

    res.set('Idempotency-Key', idempotencyKey);
    res.set('Idempotency-Replayed', 'false');
    res.status(201).json(stream);

    const config = getConfig();
    if (config.webhookUrl && config.webhookSecret) {
      dispatchWebhook({
        url: config.webhookUrl,
        secret: config.webhookSecret,
        event: 'stream.created',
        payload: stream,
      }).catch((err) => error('Failed to dispatch creation webhook', { streamId: id }, err as Error));
    }
  }),
);

/**
 * DELETE /api/streams/:id
 * Cancel a stream
 */
streamsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    const { id } = req.params;
    const index = streams.findIndex((s) => s.id === id);
    if (index === -1) throw notFound('Stream', id);

    const stream = streams[index]!;
    if (stream.status === 'cancelled') throw new ApiError(ApiErrorCode.CONFLICT, 'Stream is already cancelled', 409);
    
    streams[index] = { ...stream, status: 'cancelled' };
    recordAuditEvent('STREAM_CANCELLED', 'stream', id, req.correlationId);

    res.json({ message: 'Stream cancelled', id });

    const config = getConfig();
    if (config.webhookUrl && config.webhookSecret) {
      dispatchWebhook({
        url: config.webhookUrl,
        secret: config.webhookSecret,
        event: 'stream.deleted',
        payload: streams[index],
      }).catch((err) => error('Failed to dispatch deletion webhook', { streamId: id }, err as Error));
    }
  })
);
