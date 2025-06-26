// src/middlewares/corsMiddleware.js
import cors from 'cors';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Configures CORS middleware for secure communication with the frontend.
 * Restricts access to the specified FRONTEND_URL, supports banking-grade security,
 * and ensures auditability with request ID logging.
 * @returns {Function} Express CORS middleware
 */
const corsMiddleware = () => {
    const corsOptions = {
        origin: (origin, callback) => {
            // Allow requests from FRONTEND_URL or no origin (e.g., server-to-server)
            if (!origin || origin === env.FRONTEND_URL) {
                callback(null, true);
            } else {
                const error = new Error('Not allowed by CORS');
                error.status = 403;
                logger.warn(`CORS blocked request from origin: ${origin}`, {
                    requestId: 'N/A', // Request ID not yet set
                    origin
                });
                callback(error);
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-Request-ID'
        ],
        credentials: true, // Support cookies for authentication
        preflightContinue: false,
        optionsSuccessStatus: 204 // Return 204 for successful OPTIONS requests
    };

    return cors(corsOptions);
};

/**
 * Logs CORS preflight requests for auditability.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
corsMiddleware.preflightLogger = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        logger.info('CORS preflight request handled', {
            requestId: req.requestId || 'N/A',
            origin: req.headers.origin,
            method: req.method,
            url: req.url
        });
    }
    next();
};

export default corsMiddleware;