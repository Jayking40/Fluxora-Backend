import { Router } from 'express';

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

streamsRouter.get('/', (_req, res) => {
  res.json({ streams });
});

streamsRouter.get('/:id', (req, res) => {
  const stream = streams.find((s) => s.id === req.params.id);
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  res.json(stream);
});

streamsRouter.post('/', (req, res) => {
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
