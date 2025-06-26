// src/middlewares/validateRequest.js
import { z } from 'zod';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/response.js';

/**
 * Middleware to validate request payloads using zod schemas.
 * Ensures data integrity for banking system inputs by validating sanitized inputs.
 * Sets validated data on req.validatedBody, req.validatedQuery, req.validatedParams.
 * @param {Object} schemas - Zod schemas for body, query, params
 * @returns {Function} Express middleware
 */
const validateRequest = (schemas) => {
    const { body: bodySchema, query: querySchema, params: paramsSchema } = schemas;

    return (req, res, next) => {
        try {
            const validationErrors = [];

            // Validate body
            if (bodySchema) {
                const input = req.sanitizedBody || req.body; // Fallback to req.body if sanitizedBody is undefined
                if (input && Object.keys(input).length > 0) {
                    const result = bodySchema.safeParse(input);
                    if (!result.success) {
                        validationErrors.push({
                            field: 'body',
                            errors: result.error.issues.map((issue) => ({
                                path: issue.path.join('.'),
                                message: issue.message
                            }))
                        });
                    } else {
                        req.validatedBody = result.data;
                    }
                } else if (bodySchema.shape && Object.keys(bodySchema.shape).length > 0) {
                    // If schema expects fields but input is empty
                    validationErrors.push({
                        field: 'body',
                        errors: [{ path: '', message: 'Request body is required' }]
                    });
                }
            }

            // Validate query
            if (querySchema) {
                const input = req.sanitizedQuery || req.query;
                if (input && Object.keys(input).length > 0) {
                    const result = querySchema.safeParse(input);
                    if (!result.success) {
                        validationErrors.push({
                            field: 'query',
                            errors: result.error.issues.map((issue) => ({
                                path: issue.path.join('.'),
                                message: issue.message
                            }))
                        });
                    } else {
                        req.validatedQuery = result.data;
                    }
                }
            }

            // Validate params
            if (paramsSchema) {
                const input = req.sanitizedParams || req.params;
                if (input && Object.keys(input).length > 0) {
                    const result = paramsSchema.safeParse(input);
                    if (!result.success) {
                        validationErrors.push({
                            field: 'params',
                            errors: result.error.issues.map((issue) => ({
                                path: issue.path.join('.'),
                                message: issue.message
                            }))
                        });
                    } else {
                        req.validatedParams = result.data;
                    }
                }
            }

            if (validationErrors.length > 0) {
                logger.warn('Request validation failed', {
                    requestId: req.requestId || 'N/A',
                    method: req.method,
                    url: req.url,
                    errors: validationErrors
                });
                return res.status(400).json(
                    errorResponse(
                        'Invalid request data',
                        400,
                        validationErrors,
                        req.requestId
                    )
                );
            }

            // Log successful validation
            logger.info('Request validation succeeded', {
                requestId: req.requestId || 'N/A',
                method: req.method,
                url: req.url,
                hasBody: !!req.validatedBody,
                hasQuery: !!req.validatedQuery,
                hasParams: !!req.validatedParams
            });

            next();
        } catch (error) {
            logger.error('Validation middleware error', {
                requestId: req.requestId || 'N/A',
                method: req.method,
                url: req.url,
                error: error.message,
                stack: error.stack
            });
            res.status(500).json(
                errorResponse(
                    'Internal server error during validation',
                    500,
                    null,
                    req.requestId
                )
            );
        }
    };
};

export default validateRequest;