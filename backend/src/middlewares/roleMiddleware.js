// src/middlewares/roleMiddleware.js
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/response.js';

/**
 * Middleware to restrict access to specified roles.
 * Supports role-based access control (RBAC) for banking platform.
 * @param {string[]} allowedRoles - Array of allowed roles (e.g., ['admin'])
 * @returns {Function} Express middleware
 */
const roleMiddleware = (allowedRoles) => (req, res, next) => {
    try {
        if (!req.user) {
            logger.warn('Role middleware accessed without authenticated user', {
                requestId: req.requestId,
                method: req.method,
                url: req.url
            });
            return res.status(401).json(
                errorResponse('Unauthorized: Authentication required', 401, null, req.requestId)
            );
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn('Unauthorized role access attempt', {
                requestId: req.requestId,
                userId: req.user.id,
                role: req.user.role,
                allowedRoles
            });
            return res.status(403).json(
                errorResponse(
                    `Forbidden: Access restricted to ${allowedRoles.join(', ')} roles`,
                    403,
                    null,
                    req.requestId
                )
            );
        }

        logger.info('Role access granted', {
            requestId: req.requestId,
            userId: req.user.id,
            role: req.user.role
        });

        next();
    } catch (error) {
        logger.error('Role middleware error', {
            requestId: req.requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse('Internal server error during role check', 500, null, req.requestId)
        );
    }
};

export default roleMiddleware;