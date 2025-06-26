// src/middlewares/rateLimiter.js
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

/**
 * Configures rate-limiting middleware to prevent abuse.
 * Limits requests per IP to protect banking system resources.
 * @param {Object} options - Rate limit options
 * @returns {Function} Express rate-limiting middleware
 */
const rateLimiter = (options = {}) => {
    const defaultOptions = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // 100 requests per IP
        standardHeaders: true,
        legacyHeaders: false,
        message: async (req) => ({
            status: 'error',
            message: 'Too many requests from this IP, please try again after 15 minutes.',
            requestId: req.requestId || 'N/A'
        }),
        keyGenerator: (req) => req.ip,
        handler: (req, res, next, options) => {
            logger.warn('Rate limit exceeded', {
                requestId: req.requestId || 'N/A',
                ip: req.ip,
                method: req.method,
                url: req.url
            });
            res.status(options.statusCode).json(options.message(req));
        }
    };

    const config = { ...defaultOptions, ...options };
    return rateLimit(config);
};

export default rateLimiter;