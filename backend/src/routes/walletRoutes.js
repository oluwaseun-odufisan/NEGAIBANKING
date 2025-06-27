import express from 'express';
import { z } from 'zod';
import validateRequest from '../middlewares/validateRequest.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import rateLimiter from '../middlewares/rateLimiter.js';
import walletController from '../controllers/walletController.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Wallet routes for NEG AI Banking Platform.
 * Applies authentication, rate-limiting, and validation.
 */

/**
 * Zod schemas for request validation.
 */
const fundSchema = {
    body: z.object({
        amount: z.number().positive('Amount must be positive').max(1000000, 'Amount cannot exceed NGN 1,000,000')
    })
};

const verifyPaymentSchema = {
    body: z.object({
        transactionId: z.string().min(1, 'Transaction ID is required'),
        reference: z.string().min(1, 'Reference is required')
    })
};

const transferSchema = {
    body: z.object({
        recipientEmail: z.string().email('Invalid email format'),
        amount: z.number().positive('Amount must be positive').max(500000, 'Amount cannot exceed NGN 500,000'),
        description: z.string().max(200, 'Description cannot exceed 200 characters').optional()
    })
};

// Log schemas for debugging
logger.debug('walletRoutes: Schema definitions', {
    fundSchema: Object.keys(fundSchema),
    verifyPaymentSchema: Object.keys(verifyPaymentSchema),
    transferSchema: Object.keys(transferSchema)
});

// Rate limiter for wallet endpoints
const walletRateLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per IP
    message: async (req) => ({
        status: 'error',
        message: 'Too many wallet requests. Please try again after 15 minutes.',
        requestId: req.requestId || 'N/A'
    })
});

// Wallet routes (all protected)
router.post(
    '/fund',
    authMiddleware,
    walletRateLimiter,
    validateRequest(fundSchema),
    walletController.fundWallet
);

router.post(
    '/verify-payment',
    authMiddleware,
    walletRateLimiter,
    validateRequest(verifyPaymentSchema),
    walletController.verifyPayment
);

router.post(
    '/transfer',
    authMiddleware,
    walletRateLimiter,
    validateRequest(transferSchema),
    walletController.transferFunds
);

router.get(
    '/balance',
    authMiddleware,
    walletController.getBalance
);

export default router;