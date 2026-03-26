import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req: any, res: any) => {
  res.json({
    status: 'ok',
    service: 'fluxora-backend',
    timestamp: new Date().toISOString(),
  });
});
