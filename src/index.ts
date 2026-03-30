import { createApp } from './app.js';
import { initializeConfig, getConfig, resetConfig } from './config/env.js';
import { info, error } from './utils/logger.js';
import { gracefulShutdown } from './shutdown.js';
import { initializeTracer, createBuiltInHooks } from './tracing/hooks.js';

async function start() {
    try {
        // Load and validate environment configuration
        const config = initializeConfig();
        const { port, nodeEnv, apiVersion } = config;

        // Initialize distributed tracing
        if (config.tracingEnabled) {
            initializeTracer({
                enabled: true,
                sampleRate: config.tracingSampleRate,
                hooks: createBuiltInHooks({
                    enableBuffer: true,
                    enableMetrics: true,
                    bufferConfig: {
                        maxSpans: 1000,
                        logEvents: config.tracingLogEvents,
                        logLevel: config.logLevel,
                    },
                }),
                otel: {
                    enabled: config.tracingOtelEnabled,
                    // OTel provider would be injected here in production
                    instrumentationName: 'fluxora-backend',
                },
            });

            info('Distributed tracing initialized', {
                sampleRate: config.tracingSampleRate,
                otelEnabled: config.tracingOtelEnabled,
            });
        }

        // Create and start Express application
        const app = createApp();

        const server = app.listen(port, () => {
            info(`Fluxora API v${apiVersion} started`, {
                port,
                env: nodeEnv,
                pid: process.pid,
            });
        });

        // Initialize graceful shutdown handler
        gracefulShutdown(server);

    } catch (err) {
        error('Failed to start application', {}, err as Error);
        process.exit(1);
    }
}

// Global unhandled rejection handler
process.on('unhandledRejection', (reason) => {
    error('Unhandled Promise Rejection', { reason: String(reason) });
    // In production, we might want to exit here to allow a clean restart
});

start();
