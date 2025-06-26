// src/middlewares/securityMiddleware.js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import xss from 'xss';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/response.js';

/**
 * Custom MongoDB sanitization to remove malicious operators from inputs.
 * Creates sanitized versions without modifying original properties.
 * @param {Object} input - Input object to sanitize
 * @returns {Object} Sanitized object
 */
const sanitizeMongoInput = (input) => {
    if (!input || typeof input !== 'object') {
        logger.debug('sanitizeMongoInput: Empty or non-object input', { input });
        return input || {};
    }

    const sanitized = Array.isArray(input) ? [] : {};
    const mongoOperators = [
        '$inc', '$set', '$unset', '$push', '$pull', '$addToSet', '$pop',
        '$rename', '$bit', '$max', '$min', '$currentDate', '$type', '$exists',
        '$where', '$expr', '$jsonSchema', '$mod', '$regex', '$text', '$near',
        '$geoIntersects', '$geoWithin', '$all', '$elemMatch', '$size', '$not',
        '$nor', '$or', '$and'
    ];

    for (const [key, value] of Object.entries(input)) {
        if (mongoOperators.includes(key)) {
            logger.warn(`Detected MongoDB operator in input: ${key}`, {
                requestId: 'N/A',
                inputKey: key
            });
            continue;
        }

        if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeMongoInput(value);
        } else if (typeof value === 'string') {
            sanitized[key] = value.replace(/^\$/, '');
        } else {
            sanitized[key] = value;
        }
    }

    logger.debug('sanitizeMongoInput: Processed', { input, sanitized });
    return sanitized;
};

/**
 * Custom XSS sanitization using xss library.
 * Sanitizes req.body, req.params, and creates req.sanitizedQuery.
 * @param {Object} req - Express request object
 * @returns {Object} Sanitized request object
 */
const sanitizeXSS = (req) => {
    const xssOptions = {
        whiteList: {}, // Disallow all HTML tags
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'iframe']
    };

    // Sanitize req.body
    req.sanitizedBody = req.body && typeof req.body === 'object'
        ? Object.entries(req.body).reduce((acc, [key, value]) => {
            if (typeof value === 'string') {
                acc[key] = xss(value, xssOptions);
            } else if (typeof value === 'object' && value !== null) {
                acc[key] = sanitizeXSS({ body: value }).sanitizedBody;
            } else {
                acc[key] = value;
            }
            return acc;
        }, {})
        : {};

    // Sanitize req.params
    req.sanitizedParams = req.params && typeof req.params === 'object'
        ? Object.entries(req.params).reduce((acc, [key, value]) => {
            if (typeof value === 'string') {
                acc[key] = xss(value, xssOptions);
            } else {
                acc[key] = value;
            }
            return acc;
        }, {})
        : {};

    // Sanitize req.query
    req.sanitizedQuery = req.query && typeof req.query === 'object'
        ? Object.entries(req.query).reduce((acc, [key, value]) => {
            if (typeof value === 'string') {
                acc[key] = xss(value, xssOptions);
            } else if (typeof value === 'object' && value !== null) {
                acc[key] = sanitizeXSS({ query: value }).sanitizedQuery;
            } else {
                acc[key] = value;
            }
            return acc;
        }, {})
        : {};

    logger.debug('sanitizeXSS: Processed', {
        sanitizedBody: req.sanitizedBody,
        sanitizedParams: req.sanitizedParams,
        sanitizedQuery: req.sanitizedQuery
    });

    return req;
};

/**
 * Security middleware for banking-grade protection.
 * Applies helmet, rate-limiting, and custom sanitization (MongoDB, XSS).
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const securityMiddleware = (req, res, next) => {
    try {
        logger.debug('securityMiddleware: Processing request', {
            requestId: req.requestId || 'N/A',
            body: req.body,
            params: req.params,
            query: req.query
        });

        // Apply helmet with banking-grade headers
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:', `${env.CLOUDINARY_CLOUD_NAME}.cloudinary.com`],
                    connectSrc: ["'self'", env.BASE_URL, env.FRONTEND_URL]
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            },
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
            crossOriginResourcePolicy: { policy: 'same-origin' }
        })(req, res, () => {
            // Apply rate-limiting
            const limiter = rateLimit({
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 100, // 100 requests per IP
                standardHeaders: true,
                legacyHeaders: false,
                message: async () => ({
                    status: 'error',
                    message: 'Too many requests from this IP, please try again after 15 minutes.',
                    requestId: req.requestId || 'N/A'
                }),
                keyGenerator: (req) => req.ip
            });

            limiter(req, res, () => {
                // Apply MongoDB sanitization
                req.sanitizedBody = sanitizeMongoInput(req.body);
                req.sanitizedQuery = sanitizeMongoInput(req.query);
                req.sanitizedParams = sanitizeMongoInput(req.params);

                // Apply XSS sanitization
                sanitizeXSS(req);

                // Log sanitization events
                logger.info('Input sanitized', {
                    requestId: req.requestId || 'N/A',
                    bodySanitized: !!req.sanitizedBody,
                    querySanitized: !!req.sanitizedQuery,
                    paramsSanitized: !!req.sanitizedParams,
                    sanitizedBody: req.sanitizedBody
                });

                next();
            });
        });
    } catch (error) {
        logger.error('Security middleware error', {
            requestId: req.requestId || 'N/A',
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(
                'Internal server error during security processing',
                500,
                null,
                req.requestId || 'N/A'
            )
        );
    }
};

export default securityMiddleware;