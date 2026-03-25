import { Router } from 'express';
import { isStreamCreationPaused } from '../state/adminState.js';

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

/** Exported for test teardown only. */
export function _clearStreamsForTest(): void {
  streams.length = 0;
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
  if (isStreamCreationPaused()) {
    res.status(503).json({
      error: 'Stream creation is temporarily paused by an administrator.',
    });
    return;
  }

  const { sender, recipient, depositAmount, ratePerSecond, startTime } = req.body ?? {};
  const id = `stream-${Date.now()}`;
  const stream = {
    id,
    sender: sender ?? '',
    recipient: recipient ?? '',
    depositAmount: depositAmount ?? '0',
    ratePerSecond: ratePerSecond ?? '0',
    startTime: startTime ?? Math.floor(Date.now() / 1000),
    status: 'active',
  };
  streams.push(stream);
  res.status(201).json(stream);
});
