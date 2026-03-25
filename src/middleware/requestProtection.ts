/**
 * Request protection middleware for Fluxora Backend
 * 
 * Provides:
 * - Request size limit enforcement
 * - JSON depth validation
 * - Request timeout protection
 * 
 * Failure modes and client-visible behavior:
 * - Oversized request (413 Payload Too Large): Request exceeds size limit
 * - Excessive JSON depth (400 Bad Request): Nested objects exceed depth limit
 * - Request timeout (408 Request Timeout): Request processing exceeds timeout
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../config/logger';
import { validateJsonDepth, ValidationError } from '../config/validation';

/**
 * Custom error class for request protection violations
 */
export class RequestProtectionError extends Error {
    constructor(
        message: string,
        public statusCode: number,
        public code: string
    ) {
        super(message);
        this.name = 'RequestProtectionError';
    }
}

/**
 * Middleware to enforce request size limits
 * Must be applied before express.json() to intercept raw request
 */
export function createRequestSizeLimitMiddleware(maxSizeBytes: number) {
    return (req: Request, res: Response, next: NextFunction) => {
        const logger = req.app.locals.logger as Logger;
        const contentLength = req.get('content-length');

        if (contentLength) {
            const size = parseInt(contentLength, 10);
            if (size > maxSizeBytes) {
                logger.warn('Request rejected: payload too large', {
                    contentLength: size,
                    maxSizeBytes,
                    path: req.path,
                    method: req.method,
                });
                return res.status(413).json({
                    error: 'Payload too large',
                    code: 'PAYLOAD_TOO_LARGE',
                    details: `Request size (${size} bytes) exceeds maximum allowed (${maxSizeBytes} bytes)`,
                });
            }
        }

        next();
    };
}

/**
 * Middleware to validate JSON depth after parsing
 * Must be applied after express.json()
 */
export function createJsonDepthValidationMiddleware(maxDepth: number) {
    return (req: Request, res: Response, next: NextFunction) => {
        const logger = req.app.locals.logger as Logger;

        // Only validate JSON requests with body
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            try {
                validateJsonDepth(req.body, maxDepth, 'request body');
            } catch (err) {
                if (err instanceof ValidationError) {
                    logger.warn('Request rejected: JSON depth exceeded', {
                        maxDepth,
                        path: req.path,
                        method: req.method,
                        error: err.message,
                    });
                    return res.status(400).json({
                        error: 'Invalid request',
                        code: 'JSON_DEPTH_EXCEEDED',
                        details: err.message,
                    });
                }
                throw err;
            }
        }

        next();
    };
}

/**
 * Middleware to enforce request timeout
 * Aborts request processing if it exceeds timeout
 */
export function createRequestTimeoutMiddleware(timeoutMs: number) {
    return (req: Request, res: Response, next: NextFunction) => {
        const logger = req.app.locals.logger as Logger;

        // Set timeout on the socket
        req.socket.setTimeout(timeoutMs, () => {
            logger.warn('Request timeout', {
                timeoutMs,
                path: req.path,
                method: req.method,
                remoteAddr: req.ip,
            });

            if (!res.headersSent) {
                res.status(408).json({
                    error: 'Request timeout',
                    code: 'REQUEST_TIMEOUT',
                    details: `Request processing exceeded ${timeoutMs}ms timeout`,
                });
            }

            req.socket.destroy();
        });

        res.on('finish', () => {
            req.socket.setTimeout(0);
        });

        next();
    };
}

/**
 * Error handler for request protection errors
 * Should be registered after all other middleware
 */
export function requestProtectionErrorHandler(
    err: any,
    _req: Request,
    res: Response,
    next: NextFunction
) {
    if (err instanceof RequestProtectionError) {
        return res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
        });
    }

    next(err);
}
