import { Router } from 'express';
import { logger } from '../logging/logger.js';

export const streamsRouter = Router();

// Placeholder: replace with DB and contract sync later
const streams: Array<{
  id: string;
  sender: string;
  recipient: string;
  depositAmount: string;
  ratePerSecond: string;
  startTime: number;
  status: string;
}> = [];

/** Expose the backing store for test teardown. */
export function _resetStreams(): void {
  streams.length = 0;
}

const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;

function isValidStellarKey(value: unknown): value is string {
  return typeof value === 'string' && STELLAR_KEY_RE.test(value);
}

function isPositiveNumericString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

streamsRouter.get('/', (_req, res) => {
  res.json({ streams });
});

streamsRouter.get('/:id', (req, res) => {
  const stream = streams.find((s) => s.id === req.params.id);
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  res.json(stream);
});

streamsRouter.post('/', (req, res) => {
  const body = req.body ?? {};
  const errors: string[] = [];

  if (!isValidStellarKey(body.sender)) {
    errors.push('sender must be a valid Stellar public key (G...)');
  }
  if (!isValidStellarKey(body.recipient)) {
    errors.push('recipient must be a valid Stellar public key (G...)');
  }
  if (!isPositiveNumericString(body.depositAmount)) {
    errors.push('depositAmount must be a positive numeric string');
  }
  if (!isPositiveNumericString(body.ratePerSecond)) {
    errors.push('ratePerSecond must be a positive numeric string');
  }
  if (body.startTime !== undefined) {
    const st = Number(body.startTime);
    if (!Number.isFinite(st) || st < 0) {
      errors.push('startTime must be a non-negative number');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const id = `stream-${Date.now()}`;
  const stream = {
    id,
    sender: body.sender as string,
    recipient: body.recipient as string,
    depositAmount: body.depositAmount as string,
    ratePerSecond: body.ratePerSecond as string,
    startTime: body.startTime !== undefined
      ? Number(body.startTime)
      : Math.floor(Date.now() / 1000),
    status: 'active',
  };

  streams.push(stream);

  // Log creation without exposing Stellar keys (logger redacts automatically)
  logger.info('stream created', { streamId: id, sender: stream.sender, recipient: stream.recipient });

  res.status(201).json(stream);
});
