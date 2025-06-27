// src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/response.js';
import { User } from '../models/User.js';

/**
 * Middleware to verify JWT tokens and attach user to req.user.
 * Ensures secure authentication for protected routes in banking platform.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('No or invalid Authorization header', {
                requestId: req.requestId,
                method: req.method,
                url: req.url
            });
            return res.status(401).json(
                errorResponse('Unauthorized: No token provided', 401, null, req.requestId)
            );
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, env.JWT_SECRET);
        } catch (error) {
            logger.warn('Invalid or expired JWT', {
                requestId: req.requestId,
                method: req.method,
                url: req.url,
                error: error.message
            });
            return res.status(401).json(
                errorResponse('Unauthorized: Invalid or expired token', 401, null, req.requestId)
            );
        }

        const user = await User.findById(decoded.userId)
            .select('email role isVerified')
            .lean();
        if (!user) {
            logger.warn('User not found for JWT', {
                requestId: req.requestId,
                userId: decoded.userId
            });
            return res.status(401).json(
                errorResponse('Unauthorized: User not found', 401, null, req.requestId)
            );
        }

        req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified
        };

        logger.info('User authenticated', {
            requestId: req.requestId,
            userId: user._id,
            email: user.email,
            role: user.role
        });

        next();
    } catch (error) {
        logger.error('Authentication middleware error', {
            requestId: req.requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse('Internal server error during authentication', 500, null, req.requestId)
        );
    }
};

export default authMiddleware;