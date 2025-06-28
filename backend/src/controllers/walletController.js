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
        logger.debug('Raw request body for fundWallet', {
            userId: req.user.id,
            requestId,
            body: req.body
        });

        const input = req.validatedBody || req.body || {};
        const fundSchema = z.object({
            amount: z.number().positive('Amount must be positive').max(1000000, 'Amount cannot exceed NGN 1,000,000'),
            accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits')
        });
        const result = fundSchema.safeParse(input);

        if (!result.success) {
            logger.warn('Invalid or missing validated body for funding', {
                userId: req.user.id,
                requestId,
                body: req.body,
                validationErrors: result.error.issues
            });
            return res.status(400).json(
                errorResponse('Invalid or missing amount or account number', 400, result.error.issues, requestId)
            );
        }

        const { amount, accountNumber } = result.data;

        if (amount > 1000000) {
            logger.warn('Funding amount exceeds limit', {
                userId: req.user.id,
                amount,
                accountNumber,
                requestId
            });
            return res.status(400).json(
                errorResponse('Funding amount cannot exceed NGN 1,000,000', 400, null, requestId)
            );
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            logger.warn('User not found for funding', { userId: req.user.id, requestId });
            return res.status(404).json(
                errorResponse('User not found', 404, null, requestId)
            );
        }

        if (user.accountNumber !== accountNumber) {
            logger.warn('Account number mismatch for funding', {
                userId: user._id,
                providedAccountNumber: accountNumber,
                userAccountNumber: user.accountNumber,
                requestId
            });
            return res.status(400).json(
                errorResponse('Invalid account number', 400, null, requestId)
            );
        }

        const wallet = await Wallet.findOne({ userId: req.user.id });
        if (!wallet) {
            logger.warn('Wallet not found for funding, creating new wallet', { userId: req.user.id, requestId });
            const newWallet = new Wallet({ userId: req.user.id, balance: 0, accountNumber: user.accountNumber });
            await newWallet.save();
        }

        const reference = `FUND-${uuidv4()}`;
        const paymentData = await walletService.initiateFlutterwavePayment(
            user,
            amount,
            reference,
            requestId,
            accountNumber
        );

        logger.info('Wallet funding initiated', {
            userId: req.user.id,
            accountNumber: user.accountNumber,
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
            accountNumber: wallet.accountNumber,
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
 * Transfers funds to another user's wallet.
 */
const transferFunds = async (req, res) => {
    const requestId = req.requestId;
    try {
        logger.debug('Raw request body for transferFunds', {
            userId: req.user.id,
            requestId,
            body: req.body
        });

        const input = req.validatedBody || req.body || {};
        const transferSchema = z.object({
            recipientAccountNumber: z.string().regex(/^\d{10}$/, 'Recipient account number must be 10 digits'),
            amount: z.number().positive('Amount must be positive').max(500000, 'Amount cannot exceed NGN 500,000'),
            description: z.string().max(200, 'Description cannot exceed 200 characters').optional()
        });
        const result = transferSchema.safeParse(input);

        if (!result.success) {
            logger.warn('Invalid or missing validated body for transfer', {
                userId: req.user.id,
                requestId,
                body: req.body,
                validationErrors: result.error.issues
            });
            return res.status(400).json(
                errorResponse('Invalid or missing transfer details', 400, result.error.issues, requestId)
            );
        }

        const { recipientAccountNumber, amount, description } = result.data;
        const senderId = req.user.id;

        const sender = await User.findById(senderId);
        if (!sender) {
            logger.warn('Sender not found for transfer', { userId: senderId, requestId });
            return res.status(404).json(
                errorResponse('Sender not found', 404, null, requestId)
            );
        }

        if (recipientAccountNumber === sender.accountNumber) {
            logger.warn('Attempt to transfer to self', {
                userId: senderId,
                accountNumber: sender.accountNumber,
                recipientAccountNumber,
                requestId
            });
            return res.status(400).json(
                errorResponse('Cannot transfer to your own account', 400, null, requestId)
            );
        }

        const recipient = await User.findOne({ accountNumber: recipientAccountNumber });
        if (!recipient) {
            logger.warn('Recipient not found for transfer', {
                userId: senderId,
                recipientAccountNumber,
                requestId
            });
            return res.status(404).json(
                errorResponse('Recipient not found', 404, null, requestId)
            );
        }

        const reference = `TRANSFER-${uuidv4()}`;
        const { senderTransaction, recipientTransaction } = await walletService.transferFunds({
            senderId,
            recipientAccountNumber,
            amount,
            reference,
            description,
            requestId
        });

        logger.info('Transfer completed successfully', {
            senderId,
            senderAccountNumber: sender.accountNumber,
            recipientId: recipient._id,
            recipientAccountNumber,
            amount,
            reference,
            requestId
        });

        res.status(200).json(
            successResponse('Transfer successful', 200, {
                senderTransaction: {
                    amount: senderTransaction.amount,
                    reference: senderTransaction.reference,
                    status: senderTransaction.status,
                    target: senderTransaction.target
                },
                recipientTransaction: {
                    amount: recipientTransaction.amount,
                    reference: recipientTransaction.reference,
                    status: recipientTransaction.status
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
        res.status(500).json(
            errorResponse('Internal server error during transfer', 500, null, requestId)
        );
    }
};

/**
 * Handles Flutterwave callback after payment.
 */
const handleFlutterwaveCallback = async (req, res) => {
    const requestId = req.requestId;
    try {
        const { transaction_id, tx_ref, status } = req.validatedQuery || {};

        if (!transaction_id || !tx_ref || !status) {
            logger.warn('Invalid or missing callback parameters', {
                requestId,
                query: req.query,
                validatedQuery: req.validatedQuery
            });
            return res.status(400).json(
                errorResponse('Invalid or missing callback parameters', 400, null, requestId)
            );
        }

        logger.info('Flutterwave callback received', {
            requestId,
            transactionId: transaction_id,
            reference: tx_ref,
            status
        });

        if (status === 'successful') {
            res.status(200).json(
                successResponse('Payment callback received. Please verify payment.', 200, {
                    transactionId: transaction_id,
                    reference: tx_ref,
                    nextStep: 'Use /api/wallet/verify-payment with the transactionId and reference'
                }, requestId)
            );
        } else if (status === 'cancelled' || status === 'failed') {
            logger.warn('Payment callback indicates failure or cancellation', {
                requestId,
                transactionId: transaction_id,
                reference: tx_ref,
                status
            });
            res.status(400).json(
                errorResponse(`Payment ${status}`, 400, null, requestId)
            );
        } else {
            logger.warn('Unknown callback status', {
                requestId,
                transactionId: transaction_id,
                reference: tx_ref,
                status
            });
            res.status(400).json(
                errorResponse('Unknown callback status', 400, null, requestId)
            );
        }
    } catch (error) {
        logger.error('Error handling Flutterwave callback', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse('Internal server error during callback handling', 500, null, requestId)
        );
    }
};

/**
 * Handles Flutterwave webhook for payment events.
 */
const handleFlutterwaveWebhook = async (req, res) => {
    const requestId = req.requestId;
    try {
        const { id: transactionId, txRef: reference, status } = req.validatedBody || {};

        if (!transactionId || !reference || !status) {
            logger.warn('Invalid or missing webhook parameters', {
                requestId,
                body: req.body,
                validatedBody: req.validatedBody
            });
            return res.status(400).json(
                errorResponse('Invalid or missing webhook parameters', 400, null, requestId)
            );
        }

        logger.info('Flutterwave webhook received', {
            requestId,
            transactionId,
            reference,
            status
        });

        if (status === 'successful') {
            const verificationData = await walletService.verifyFlutterwavePayment(
                transactionId,
                requestId
            );

            if (verificationData.status !== 'success') {
                logger.warn('Webhook verification failed', {
                    requestId,
                    transactionId,
                    reference,
                    verificationStatus: verificationData.status
                });
                return res.status(400).json(
                    errorResponse('Webhook verification failed', 400, null, requestId)
                );
            }

            const amount = verificationData.data.amount;
            const userEmail = verificationData.data.customer.email;
            const user = await User.findOne({ email: userEmail });
            if (!user) {
                logger.warn('User not found for webhook', {
                    requestId,
                    email: userEmail,
                    transactionId,
                    reference
                });
                return res.status(404).json(
                    errorResponse('User not found', 404, null, requestId)
                );
            }

            const wallet = await Wallet.findOne({ userId: user._id }).select('+balance');
            if (!wallet) {
                logger.warn('Wallet not found for webhook, creating new wallet', {
                    userId: user._id,
                    requestId
                });
                const newWallet = new Wallet({ userId: user._id, balance: 0, accountNumber: user.accountNumber });
                await newWallet.save();
            }

            const existingTransaction = wallet.ledger.find(
                (tx) => tx.reference === reference
            );
            if (existingTransaction) {
                logger.warn('Duplicate webhook transaction detected', {
                    userId: user._id,
                    reference,
                    requestId
                });
                return res.status(409).json(
                    errorResponse('Transaction already processed', 409, null, requestId)
                );
            }

            const { wallet: updatedWallet } = await walletService.creditWallet({
                userId: user._id,
                amount,
                reference,
                source: 'flutterwave',
                description: 'Wallet funding via Flutterwave webhook',
                requestId,
                flutterwaveTxId: transactionId
            });

            logger.info('Webhook processed and wallet credited', {
                userId: user._id,
                accountNumber: user.accountNumber,
                amount,
                reference,
                requestId
            });

            res.status(200).json(
                successResponse('Webhook processed successfully', 200, {
                    balance: updatedWallet.balance,
                    transactionId,
                    reference
                }, requestId)
            );
        } else {
            logger.warn('Webhook indicates non-successful payment', {
                requestId,
                transactionId,
                reference,
                status
            });
            res.status(200).json(
                successResponse(`Webhook received for ${status} payment`, 200, null, requestId)
            );
        }
    } catch (error) {
        logger.error('Error handling Flutterwave webhook', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse('Internal server error during webhook handling', 500, null, requestId)
        );
    }
};

/**
 * Gets wallet balance.
 */
const getBalance = async (req, res) => {
    const requestId = req.requestId;
    try {
        const wallet = await Wallet.findOne({ userId: req.user.id }).select('+balance');
        if (!wallet) {
            logger.warn('Wallet not found for balance check', { userId: req.user.id, requestId });
            return res.status(404).json(
                errorResponse('Wallet not found', 404, null, requestId)
            );
        }

        logger.info('Balance retrieved successfully', {
            userId: req.user.id,
            accountNumber: wallet.accountNumber,
            requestId
        });

        res.status(200).json(
            successResponse('Balance retrieved successfully', 200, {
                balance: wallet.balance,
                accountNumber: wallet.accountNumber
            }, requestId)
        );
    } catch (error) {
        logger.error('Error retrieving balance', {
            userId: req.user.id,
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
    handleFlutterwaveCallback,
    handleFlutterwaveWebhook,
    getBalance
};