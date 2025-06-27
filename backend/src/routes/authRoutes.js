// src/routes/authRoutes.js
import express from 'express';
import validateRequest from '../middlewares/validateRequest.js';
import { z } from 'zod';
import {
    register,
    login,
    refreshToken,
    getProfile,
    logout,
    logoutAll,
    requestPasswordReset,
    resetPassword,
    createWalletForUser
} from '../controllers/authController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import logger from '../utils/logger.js';
import rateLimiter from '../middlewares/rateLimiter.js';

const router = express.Router();

/**
 * Zod schema for user registration.
 */
const registerSchema = {
    body: z.object({
        email: z.string().email({ message: 'Invalid email format' }),
        password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
        nin: z.string().length(11, { message: 'NIN must be 11 digits' }).optional()
    })
};

/**
 * Zod schema for user login.
 */
const loginSchema = {
    body: z.object({
        email: z.string().email({ message: 'Invalid email format' }),
        password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
        deviceId: z.string().optional()
    })
};

/**
 * Zod schema for token refresh.
 */
const refreshTokenSchema = {
    body: z.object({
        refreshToken: z.string()
    })
};

/**
 * Zod schema for password reset request.
 */
const passwordResetRequestSchema = {
    body: z.object({
        email: z.string().email({ message: 'Invalid email format' })
    })
};

/**
 * Zod schema for password reset.
 */
const resetPasswordSchema = {
    body: z.object({
        token: z.string(),
        newPassword: z.string().min(8, { message: 'New password must be at least 8 characters' })
    })
};

/**
 * Zod schema for creating wallet for existing user.
 */
const createWalletSchema = {
    body: z.object({
        email: z.string().email({ message: 'Invalid email format' })
    })
};

// Rate limiter for sensitive endpoints
const authRateLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per IP
    message: async (req) => ({
        status: 'error',
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
        requestId: req.requestId || 'N/A'
    })
});

// Public routes
router.post('/register', authRateLimiter, validateRequest(registerSchema), register);
router.post('/login', validateRequest(loginSchema), login);
router.post('/refresh-token', validateRequest(refreshTokenSchema), refreshToken);
router.post('/request-password-reset', validateRequest(passwordResetRequestSchema), requestPasswordReset);
router.post('/reset-password', validateRequest(resetPasswordSchema), resetPassword);

// Protected routes
router.get('/profile', authMiddleware, getProfile);
router.post('/logout', authMiddleware, logout);
router.post('/logout-all', authMiddleware, logoutAll);

// Admin routes
router.post('/create-wallet', authMiddleware, roleMiddleware(['admin']), validateRequest(createWalletSchema), createWalletForUser);
router.get('/admin/users', authMiddleware, roleMiddleware(['admin']), (req, res) => {
    res.status(200).json({ message: 'Admin users endpoint' });
});

export default router;