// src/middlewares/errorHandler.js
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/response.js';

/**
 * Global error handling middleware for banking system.
 * Logs errors, formats responses, and ensures auditability.
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const errorHandler = (err, req, res, next) => {
    const statusCode = err.status || 500;
    const message = err.message || 'Internal server error';
    const requestId = req.requestId || 'N/A';

    // Log error details
    logger.error('Application error', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        statusCode,
        error: message,
        stack: err.stack,
        userAgent: req.headers['user-agent'] || 'unknown'
    });

    // Format response
    const response = errorResponse(
        message,
        statusCode,
        process.env.NODE_ENV === 'development' ? err.stack : null,
        requestId
    );

    res.status(statusCode).json(response);
};

export default errorHandler;