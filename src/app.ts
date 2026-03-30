/**
 * Express application factory.
 *
 * Separated from the server bootstrap in index.ts so that tests
 * can import the app without binding to a port.
 */

import express from 'express';
import { streamsRouter } from './routes/streams.js';
import { healthRouter } from './routes/health.js';
import { privacyRouter } from './routes/privacy.js';
import { privacyHeaders, requestLogger, safeErrorHandler } from './middleware/pii.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { tracingMiddleware } from './tracing/middleware.js';
import { getConfig } from './config/env.js';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());
  app.use(privacyHeaders);

  // Correlation ID middleware (required for tracing)
  app.use(correlationIdMiddleware);

  // Distributed tracing middleware (optional, enabled via env config)
  // The tracer is initialized globally in index.ts based on environment variables
  // This is safe to call even if config hasn't been initialized (will just use defaults)
  try {
    const config = getConfig();
    if (config && config.tracingEnabled) {
      app.use(tracingMiddleware({
        enabled: true,
        sampleRate: config.tracingSampleRate ?? 1.0,
      }));
    }
  } catch (err) {
    // Configuration not initialized (may be in tests), skip tracing middleware
    // This is safe and the app will continue to function normally
  }

  app.use(requestLogger);

  app.use('/health', healthRouter);
  app.use('/api/streams', streamsRouter);
  app.use('/api/privacy', privacyRouter);

  app.get('/', (_req, res) => {
    res.json({
      name: 'Fluxora API',
      version: '0.1.0',
      docs: 'Programmable treasury streaming on Stellar.',
    });
  });

  app.use(safeErrorHandler);

  return app;
}
