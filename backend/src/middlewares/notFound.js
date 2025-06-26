// src/middlewares/notFound.js
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/response.js';

/**
 * Middleware to handle 404 Not Found errors for non-existent routes.
 * Ensures consistent responses and auditability.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const notFound = (req, res, next) => {
    const requestId = req.requestId || 'N/A';

    logger.warn('Resource not found', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown'
    });

    res.status(404).json(
        errorResponse('Resource not found', 404, null, requestId)
    );
};

export default notFound;