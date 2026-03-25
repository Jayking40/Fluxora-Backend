import express from 'express';
import { streamsRouter } from './routes/streams.js';
import { healthRouter } from './routes/health.js';
import { adminRouter } from './routes/admin.js';

export const app = express();

app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/streams', streamsRouter);
app.use('/api/admin', adminRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'Fluxora API',
    version: '0.1.0',
    docs: 'Programmable treasury streaming on Stellar.',
  });
});
