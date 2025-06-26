// src/middlewares/requestId.js
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * Middleware to assign a unique request ID to each incoming request.
 * Critical for audit trails and debugging in a banking system.
 * Sets X-Request-ID header in responses for traceability.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requestIdMiddleware = (req, res, next) => {
    try {
        // Generate or use existing request ID
        const requestId = req.headers['x-request-id'] || uuidv4();
        req.requestId = requestId;

        // Set response header
        res.setHeader('X-Request-ID', requestId);

        // Log request start for auditability
        logger.info('Incoming request', {
            requestId,
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.headers['user-agent'] || 'unknown'
        });

        // Attach request ID to response locals for error handling
        res.locals.requestId = requestId;

        next();
    } catch (error) {
        logger.error('Failed to assign request ID', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            status: 'error',
            message: 'Internal server error during request processing'
        });
    }
};

export default requestIdMiddleware;