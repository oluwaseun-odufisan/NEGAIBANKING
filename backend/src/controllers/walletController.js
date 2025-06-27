import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import walletService from '../services/walletService.js';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Wallet controller for NEG AI Banking Platform.
 * Handles funding, verification, transfers, and balance checks with fraud detection.
 */

/**
 * Funds wallet via Flutterwave.
 */
const fundWallet = async (req, res) => {
    const requestId = req.requestId;
    try {
        // Fallback to req.body if validatedBody is undefined
        const input = req.validatedBody || req.body || {};
        const amountSchema = z.number().positive('Amount must be positive').max(1000000, 'Amount cannot exceed NGN 1,000,000');
        const result = amountSchema.safeParse(input.amount);

        if (!result.success) {
            logger.warn('Invalid or missing amount for funding', {
                userId: req.user.id,
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody,
                validatedBody: req.validatedBody,
                validationErrors: result.error.issues
            });
            return res.status(400).json(
                errorResponse('Invalid or missing amount in request body', 400, result.error.issues, requestId)
            );
        }

        const { amount } = result.data;
        const userId = req.user.id;

        // Fraud detection: Limit to 1M NGN
        if (amount > 1000000) {
            logger.warn('Funding amount exceeds limit', {
                userId,
                amount,
                requestId
            });
            return res.status(400).json(
                errorResponse('Funding amount cannot exceed NGN 1,000,000', 400, null, requestId)
            );
        }

        const user = await User.findById(userId);
        if (!user) {
            logger.warn('User not found for funding', { userId, requestId });
            return res.status(404).json(
                errorResponse('User not found', 404, null, requestId)
            );
        }

        const wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            logger.warn('Wallet not found for funding, creating new wallet', { userId, requestId });
            const newWallet = new Wallet({ userId, balance: 0 });
            await newWallet.save();
        }

        const reference = `FUND-${uuidv4()}`;
        const paymentData = await walletService.initiateFlutterwavePayment(
            user,
            amount,
            reference,
            requestId
        );

        logger.info('Wallet funding initiated', {
            userId,
            amount,
            reference,
            requestId
        });

        res.status(200).json(
            successResponse('Payment initiated successfully', 200, {
                paymentUrl: paymentData.data.link,
                reference,
                walletId: wallet?._id || newWallet._id
            }, requestId)
        );
    } catch (error) {
        logger.error('Error initiating wallet funding', {
            userId: req.user?.id,
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse('Internal server error during funding', 500, null, requestId)
        );
    }
};

/**
 * Verifies Flutterwave payment and credits wallet.
 */
const verifyPayment = async (req, res) => {
    const requestId = req.requestId;
    try {
        // Fallback to req.body if validatedBody is undefined
        const input = req.validatedBody || req.body || {};
        const verifySchema = z.object({
            transactionId: z.string().min(1, 'Transaction ID is required'),
            reference: z.string().min(1, 'Reference is required')
        });
        const result = verifySchema.safeParse(input);

        if (!result.success) {
            logger.warn('Invalid or missing validated body for payment verification', {
                userId: req.user.id,
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody,
                validatedBody: req.validatedBody,
                validationErrors: result.error.issues
            });
            return res.status(400).json(
                errorResponse('Invalid or missing transactionId or reference', 400, result.error.issues, requestId)
            );
        }

        const { transactionId, reference } = result.data;
        const userId = req.user.id;

        const wallet = await Wallet.findOne({ userId }).select('+balance');
        if (!wallet) {
            logger.warn('Wallet not found for verification', { userId, requestId });
            return res.status(404).json(
                errorResponse('Wallet not found', 404, null, requestId)
            );
        }

        // Check if transaction already processed
        const existingTransaction = wallet.ledger.find(
            (tx) => tx.reference === reference
        );
        if (existingTransaction) {
            logger.warn('Duplicate transaction verification attempted', {
                userId,
                reference,
                requestId
            });
            return res.status(409).json(
                errorResponse('Transaction already processed', 409, null, requestId)
            );
        }

        const verificationData = await walletService.verifyFlutterwavePayment(
            transactionId,
            requestId
        );

        if (verificationData.status !== 'success') {
            logger.warn('Payment verification failed', {
                userId,
                transactionId,
                reference,
                requestId,
                verificationStatus: verificationData.status
            });
            return res.status(400).json(
                errorResponse('Payment verification failed', 400, null, requestId)
            );
        }

        const amount = verificationData.data.amount;
        if (amount > 1000000) {
            logger.warn('Verified amount exceeds limit', {
                userId,
                amount,
                reference,
                requestId
            });
            return res.status(400).json(
                errorResponse('Verified amount exceeds NGN 1,000,000', 400, null, requestId)
            );
        }

        const { wallet: updatedWallet } = await walletService.creditWallet({
            userId,
            amount,
            reference,
            source: 'flutterwave',
            description: 'Wallet funding via Flutterwave',
            requestId,
            flutterwaveTxId: transactionId
        });

        logger.info('Payment verified and wallet credited', {
            userId,
            amount,
            reference,
            requestId
        });

        res.status(200).json(
            successResponse('Payment verified and wallet credited', 200, {
                balance: updatedWallet.balance,
                transactionId,
                reference
            }, requestId)
        );
    } catch (error) {
        logger.error('Error verifying payment', {
            userId: req.user?.id,
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse('Internal server error during payment verification', 500, null, requestId)
        );
    }
};

/**
 * Transfers funds to another user.
 */
const transferFunds = async (req, res) => {
    const requestId = req.requestId;
    try {
        // Fallback to req.body if validatedBody is undefined
        const input = req.validatedBody || req.body || {};
        const transferSchema = z.object({
            recipientEmail: z.string().email('Invalid email format'),
            amount: z.number().positive('Amount must be positive').max(500000, 'Amount cannot exceed NGN 500,000'),
            description: z.string().max(200, 'Description cannot exceed 200 characters').optional()
        });
        const result = transferSchema.safeParse(input);

        if (!result.success) {
            logger.warn('Invalid or missing validated body for transfer', {
                userId: req.user.id,
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody,
                validatedBody: req.validatedBody,
                validationErrors: result.error.issues
            });
            return res.status(400).json(
                errorResponse('Invalid or missing recipientEmail or amount', 400, result.error.issues, requestId)
            );
        }

        const { recipientEmail, amount, description } = result.data;
        const senderId = req.user.id;

        // Fraud detection: Limit to 500K NGN
        if (amount > 500000) {
            logger.warn('Transfer amount exceeds limit', {
                userId: senderId,
                amount,
                requestId
            });
            return res.status(400).json(
                errorResponse('Transfer amount cannot exceed NGN 500,000', 400, null, requestId)
            );
        }

        // Prevent self-transfer
        if (recipientEmail === req.user.email) {
            logger.warn('Self-transfer attempted', {
                userId: senderId,
                recipientEmail,
                requestId
            });
            return res.status(400).json(
                errorResponse('Cannot transfer to self', 400, null, requestId)
            );
        }

        const reference = `TRANSFER-${uuidv4()}`;
        const { senderTransaction, recipientTransaction } = await walletService.transferFunds({
            senderId,
            recipientEmail,
            amount,
            reference,
            description,
            requestId
        });

        logger.info('Transfer completed', {
            senderId,
            recipientEmail,
            amount,
            reference,
            requestId
        });

        res.status(200).json(
            successResponse('Transfer completed successfully', 200, {
                transaction: {
                    reference,
                    amount,
                    status: senderTransaction.status,
                    createdAt: senderTransaction.createdAt
                }
            }, requestId)
        );
    } catch (error) {
        logger.error('Error transferring funds', {
            userId: req.user?.id,
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(400).json(
            errorResponse(error.message || 'Internal server error during transfer', 400, null, requestId)
        );
    }
};

/**
 * Gets wallet balance and recent transactions.
 */
const getBalance = async (req, res) => {
    const requestId = req.requestId;
    try {
        const userId = req.user.id;
        const wallet = await Wallet.findOne({ userId }).select('+balance');
        if (!wallet) {
            logger.warn('Wallet not found for balance check, creating new wallet', { userId, requestId });
            const newWallet = new Wallet({ userId, balance: 0 });
            await newWallet.save();
            return res.status(200).json(
                successResponse('Wallet balance retrieved successfully', 200, {
                    balance: 0,
                    transactions: []
                }, requestId)
            );
        }

        // Get last 10 transactions
        const recentTransactions = wallet.ledger
            .slice(-10)
            .map((tx) => ({
                type: tx.type,
                amount: tx.amount,
                reference: tx.reference,
                status: tx.status,
                source: tx.source,
                target: tx.target,
                description: tx.description,
                createdAt: tx.createdAt
            }));

        logger.info('Wallet balance retrieved', { userId, requestId });

        res.status(200).json(
            successResponse('Wallet balance retrieved successfully', 200, {
                balance: wallet.balance,
                transactions: recentTransactions
            }, requestId)
        );
    } catch (error) {
        logger.error('Error retrieving wallet balance', {
            userId: req.user?.id,
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse('Internal server error during balance retrieval', 500, null, requestId)
        );
    }
};

export default {
    fundWallet,
    verifyPayment,
    transferFunds,
    getBalance
};