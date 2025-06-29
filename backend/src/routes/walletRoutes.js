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
        amount: z.number().positive('Amount must be positive').max(1000000, 'Amount cannot exceed NGN 1,000,000'),
        accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits')
    })
};

const verifyPaymentSchema = {
    body: z.object({
        transactionId: z.string().min(1, 'Transaction ID is required'),
        reference: z.string().min(1, 'Reference is required')
    })
};

const verifyBankSchema = {
    body: z.object({
        accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
        bankCode: z.string().regex(/^\d{3}$/, 'Bank code must be 3 digits')
    })
};

const transferSchema = {
    body: z.object({
        recipientAccountNumber: z.string().regex(/^\d{10}$/, 'Recipient account number must be 10 digits'),
        amount: z.number().positive('Amount must be positive').max(500000, 'Amount cannot exceed NGN 500,000'),
        description: z.string().max(200, 'Description cannot exceed 200 characters').optional(),
        bankCode: z.string().regex(/^\d{3}$/, 'Bank code must be 3 digits').optional(),
        recipientAccountName: z.string().min(1, 'Recipient account name is required').optional(),
        recipientBankName: z.string().min(1, 'Recipient bank name is required').optional()
    })
};

const callbackSchema = {
    query: z.object({
        transaction_id: z.string().min(1, 'Transaction ID is required').optional(),
        tx_ref: z.string().min(1, 'Reference is required').optional(),
        status: z.enum(['successful', 'cancelled', 'failed']).optional()
    })
};

const webhookSchema = {
    body: z.object({
        'event.type': z.string().min(1, 'Event type is required'),
        transfer: z.object({
            id: z.number().min(1, 'Transaction ID is required'),
            reference: z.string().min(1, 'Reference is required'),
            status: z.enum(['SUCCESSFUL', 'FAILED', 'PENDING']),
            account_number: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits').optional(),
            bank_name: z.string().min(1, 'Bank name is required').optional(),
            amount: z.number().positive('Amount must be positive').optional(),
            sender_account_number: z.string().optional(),
            sender_bank_name: z.string().optional()
        })
    })
};

// Log schemas for debugging
logger.debug('walletRoutes: Schema definitions', {
    fundSchema: Object.keys(fundSchema),
    verifyPaymentSchema: Object.keys(verifyPaymentSchema),
    verifyBankSchema: Object.keys(verifyBankSchema),
    transferSchema: Object.keys(transferSchema),
    callbackSchema: Object.keys(callbackSchema),
    webhookSchema: Object.keys(webhookSchema)
});

// Rate limiter for wallet endpoints
const walletRateLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: async (req) => ({
        status: 'error',
        message: 'Too many wallet requests. Please try again after 15 minutes.',
        requestId: req.requestId || 'N/A'
    })
});

// Wallet routes (all protected except callback and webhook)
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
    '/verify-bank',
    authMiddleware,
    walletRateLimiter,
    validateRequest(verifyBankSchema),
    walletController.verifyBankAccount
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

router.get(
    '/callback',
    validateRequest(callbackSchema),
    walletController.handleFlutterwaveCallback
);

router.post(
    '/webhook',
    validateRequest(webhookSchema),
    walletController.handleFlutterwaveWebhook
);

export default router;