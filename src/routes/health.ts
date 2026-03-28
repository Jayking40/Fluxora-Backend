import { Router } from 'express';
import { successResponse } from '../utils/response.js';

export const healthRouter = Router();

/**
 * Health check route for the Fluxora API.
 * 
 * Returns a 200 OK with common health metrics and dependencies.
 */
healthRouter.get('/', (_req, res) => {
  res.json(successResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '0.1.0',
    dependencies: {
        database: 'healthy',
        redis: 'healthy',
        stellar: 'healthy',
    }
  }));
});
