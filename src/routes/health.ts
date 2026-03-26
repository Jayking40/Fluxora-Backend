import { Router } from 'express';
import { isShuttingDown } from '../shutdown.js';

export const healthRouter = Router();

/**
 * GET /health
 *
 * Liveness + readiness probe.
 *  - 200 OK         → service is healthy and accepting traffic.
 *  - 503 Shutting Down → SIGTERM received; load balancer should stop routing here.
 *
 * Response always includes `status`, `service`, and `timestamp` so monitoring
 * tools can parse a consistent shape regardless of status code.
 */
healthRouter.get('/', (_req, res) => {
  if (isShuttingDown()) {
    res.status(503).json({
      status: 'shutting_down',
      service: 'fluxora-backend',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.json({
    status: 'ok',
    service: 'fluxora-backend',
    timestamp: new Date().toISOString(),
  });
});
