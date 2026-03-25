import { describe, it, expect, beforeEach } from '@jest/globals';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { Logger } from '../config/logger';
import {
    createRequestSizeLimitMiddleware,
    createJsonDepthValidationMiddleware,
    createRequestTimeoutMiddleware,
    requestProtectionErrorHandler,
} from './requestProtection';

describe('Request Protection Middleware', () => {
    let app: express.Application;
    let logger: Logger;

    beforeEach(() => {
        app = express();
        logger = new Logger('error');
        app.locals.logger = logger;
    });

    describe('createRequestSizeLimitMiddleware', () => {
        it('should allow requests within size limit', async () => {
            const maxSize = 1024;
            app.use(createRequestSizeLimitMiddleware(maxSize));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app)
                .post('/test')
                .set('Content-Type', 'application/json')
                .send({ data: 'small' });

            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
        });

        it('should reject requests exceeding size limit', async () => {
            const maxSize = 100;
            app.use(createRequestSizeLimitMiddleware(maxSize));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const largePayload = 'x'.repeat(200);
            const response = await request(app)
                .post('/test')
                .set('Content-Type', 'application/json')
                .send({ data: largePayload });

            expect(response.status).toBe(413);
            expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
        });

        it('should log oversized requests', async () => {
            const maxSize = 100;
            const warnSpy = jest.spyOn(logger, 'warn');

            app.use(createRequestSizeLimitMiddleware(maxSize));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const largePayload = 'x'.repeat(200);
            await request(app)
                .post('/test')
                .set('Content-Type', 'application/json')
                .send({ data: largePayload });

            expect(warnSpy).toHaveBeenCalledWith(
                'Request rejected: payload too large',
                expect.objectContaining({
                    maxSizeBytes: maxSize,
                })
            );

            warnSpy.mockRestore();
        });

        it('should allow requests without content-length header', async () => {
            const maxSize = 1024;
            app.use(createRequestSizeLimitMiddleware(maxSize));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app)
                .post('/test')
                .set('Content-Type', 'application/json')
                .send({ data: 'test' });

            expect(response.status).toBe(200);
        });
    });

    describe('createJsonDepthValidationMiddleware', () => {
        it('should allow shallow JSON objects', async () => {
            app.use(express.json());
            app.use(createJsonDepthValidationMiddleware(5));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app)
                .post('/test')
                .send({ a: 1, b: 2, c: 3 });

            expect(response.status).toBe(200);
        });

        it('should allow JSON within depth limit', async () => {
            app.use(express.json());
            app.use(createJsonDepthValidationMiddleware(5));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app)
                .post('/test')
                .send({ a: { b: { c: { d: 1 } } } });

            expect(response.status).toBe(200);
        });

        it('should reject JSON exceeding depth limit', async () => {
            app.use(express.json());
            app.use(createJsonDepthValidationMiddleware(2));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app)
                .post('/test')
                .send({ a: { b: { c: { d: 1 } } } });

            expect(response.status).toBe(400);
            expect(response.body.code).toBe('JSON_DEPTH_EXCEEDED');
        });

        it('should log depth violations', async () => {
            const warnSpy = jest.spyOn(logger, 'warn');

            app.use(express.json());
            app.use(createJsonDepthValidationMiddleware(2));
            app.post('/test', (req, res) => res.json({ ok: true }));

            await request(app)
                .post('/test')
                .send({ a: { b: { c: 1 } } });

            expect(warnSpy).toHaveBeenCalledWith(
                'Request rejected: JSON depth exceeded',
                expect.objectContaining({
                    maxDepth: 2,
                })
            );

            warnSpy.mockRestore();
        });

        it('should skip validation for GET requests', async () => {
            app.use(express.json());
            app.use(createJsonDepthValidationMiddleware(1));
            app.get('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app).get('/test');

            expect(response.status).toBe(200);
        });

        it('should skip validation for requests without body', async () => {
            app.use(express.json());
            app.use(createJsonDepthValidationMiddleware(1));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app)
                .post('/test')
                .set('Content-Type', 'application/json');

            expect(response.status).toBe(200);
        });

        it('should handle deeply nested arrays', async () => {
            app.use(express.json());
            app.use(createJsonDepthValidationMiddleware(2));
            app.post('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app)
                .post('/test')
                .send({ a: [[[[1]]]] });

            expect(response.status).toBe(400);
            expect(response.body.code).toBe('JSON_DEPTH_EXCEEDED');
        });
    });

    describe('createRequestTimeoutMiddleware', () => {
        it('should allow requests completing within timeout', async () => {
            app.use(createRequestTimeoutMiddleware(5000));
            app.get('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app).get('/test');

            expect(response.status).toBe(200);
        });

        it('should set socket timeout', async () => {
            const timeoutMs = 5000;
            app.use(createRequestTimeoutMiddleware(timeoutMs));
            app.get('/test', (req, res) => res.json({ ok: true }));

            const response = await request(app).get('/test');

            expect(response.status).toBe(200);
        });
    });

    describe('requestProtectionErrorHandler', () => {
        it('should handle request protection errors', async () => {
            app.use((req, res, next) => {
                const err = new Error('Test error');
                (err as any).statusCode = 400;
                (err as any).code = 'TEST_ERROR';
                next(err);
            });
            app.use(requestProtectionErrorHandler);
            app.use((err: any, req: Request, res: Response, next: NextFunction) => {
                res.status(500).json({ error: 'Internal error' });
            });

            const response = await request(app).get('/test');

            expect(response.status).toBe(500);
        });

        it('should pass through non-protection errors', async () => {
            app.use((req, res, next) => {
                next(new Error('Generic error'));
            });
            app.use(requestProtectionErrorHandler);
            app.use((err: any, req: Request, res: Response, next: NextFunction) => {
                res.status(500).json({ error: 'Internal error' });
            });

            const response = await request(app).get('/test');

            expect(response.status).toBe(500);
        });
    });

    describe('Integration: Full middleware stack', () => {
        it('should enforce all protections together', async () => {
            const maxSize = 10 * 1024; // 10KB
            const maxDepth = 5;
            const timeout = 30000;

            app.use(createRequestSizeLimitMiddleware(maxSize));
            app.use(express.json({ limit: `${maxSize}b` }));
            app.use(createJsonDepthValidationMiddleware(maxDepth));
            app.use(createRequestTimeoutMiddleware(timeout));
            app.post('/test', (req, res) => res.json({ ok: true }));

            // Valid request
            const validResponse = await request(app)
                .post('/test')
                .send({ a: { b: { c: 1 } } });
            expect(validResponse.status).toBe(200);

            // Oversized request
            const largePayload = 'x'.repeat(20 * 1024);
            const sizeResponse = await request(app)
                .post('/test')
                .send({ data: largePayload });
            expect(sizeResponse.status).toBe(413);

            // Deep nesting
            const deepResponse = await request(app)
                .post('/test')
                .send({ a: { b: { c: { d: { e: { f: 1 } } } } } });
            expect(deepResponse.status).toBe(400);
        });
    });
});
