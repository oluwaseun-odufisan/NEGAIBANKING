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
    return async (req, res, next) => {
        try {
            // Log schema structure
            logger.debug('validateRequest: Schema received', {
                requestId: req.requestId,
                method: req.method,
                url: req.originalUrl,
                schemaKeys: schemas ? Object.keys(schemas) : null,
                hasBodySchema: !!schemas?.body,
                hasQuerySchema: !!schemas?.query,
                hasParamsSchema: !!schemas?.params
            });

            if (!schemas || typeof schemas !== 'object' || !Object.keys(schemas).length) {
                logger.warn('validateRequest: No schemas provided, skipping validation', {
                    requestId: req.requestId,
                    url: req.originalUrl
                });
                return next();
            }

            const { body: bodySchema, query: querySchema, params: paramsSchema } = schemas;
            const validationErrors = [];

            // Validate body
            if (bodySchema) {
                if (!(bodySchema instanceof z.ZodObject)) {
                    logger.error('validateRequest: Invalid body schema type', {
                        requestId: req.requestId,
                        url: req.originalUrl,
                        schemaType: typeof bodySchema,
                        schemaKeys: bodySchema.shape ? Object.keys(bodySchema.shape) : null
                    });
                    return res.status(500).json(
                        errorResponse(
                            'Server configuration error: Invalid body schema',
                            500,
                            null,
                            req.requestId
                        )
                    );
                }

                const input = req.sanitizedBody || req.body || {};
                logger.debug('validateRequest: Validating body', {
                    requestId: req.requestId,
                    input,
                    schemaFields: bodySchema.shape ? Object.keys(bodySchema.shape) : null
                });

                const result = await bodySchema.safeParseAsync(input);
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
                    logger.debug('validateRequest: Body validated successfully', {
                        requestId: req.requestId,
                        validatedBody: req.validatedBody
                    });
                }
            }

            // Validate query
            if (querySchema) {
                const input = req.sanitizedQuery || req.query || {};
                logger.debug('validateRequest: Validating query', {
                    requestId: req.requestId,
                    input,
                    schemaFields: querySchema.shape ? Object.keys(querySchema.shape) : null
                });

                const result = await querySchema.safeParseAsync(input);
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
                    logger.debug('validateRequest: Query validated successfully', {
                        requestId: req.requestId,
                        validatedQuery: req.validatedQuery
                    });
                }
            }

            // Validate params
            if (paramsSchema) {
                const input = req.sanitizedParams || req.params || {};
                logger.debug('validateRequest: Validating params', {
                    requestId: req.requestId,
                    input,
                    schemaFields: paramsSchema.shape ? Object.keys(paramsSchema.shape) : null
                });

                const result = await paramsSchema.safeParseAsync(input);
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
                    logger.debug('validateRequest: Params validated successfully', {
                        requestId: req.requestId,
                        validatedParams: req.validatedParams
                    });
                }
            }

            if (validationErrors.length > 0) {
                logger.warn('Request validation failed', {
                    requestId: req.requestId,
                    method: req.method,
                    url: req.originalUrl,
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
                requestId: req.requestId,
                method: req.method,
                url: req.originalUrl,
                hasBody: !!req.validatedBody,
                validatedBody: req.validatedBody,
                hasQuery: !!req.validatedQuery,
                hasParams: !!req.validatedParams
            });

            next();
        } catch (error) {
            logger.error('Validation middleware error', {
                requestId: req.requestId,
                method: req.method,
                url: req.originalUrl,
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