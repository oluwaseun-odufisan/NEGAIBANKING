import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import walletService from '../services/walletService.js';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Wallet controller for NEG AI Banking Platform.
 * Handles funding, verification, internal/external transfers, bank account verification, and balance checks with fraud detection.
 */

/**
 * Verifies a bank account.
 */
const verifyBankAccount = async (req, res) => {
    const requestId = req.requestId;
    try {
        const input = req.validatedBody || req.body || {};
        const verifySchema = z.object({
            accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
            bankCode: z.string().regex(/^\d{3}$/, 'Bank code must be 3 digits')
        });
        const result = verifySchema.safeParse(input);

        if (!result.success) {
            logger.warn('Invalid or missing validated body for bank verification', {
                userId: req.user.id,
                requestId,
                body: req.body,
                validationErrors: result.error.issues
            });
            return res.status(400).json(
                errorResponse('Invalid or missing account number or bank code', 400, result.error.issues, requestId)
            );
        }

        const { accountNumber, bankCode } = result.data;

        const verificationData = await walletService.verifyBankAccount({
            accountNumber,
            bankCode,
            requestId
        });

        logger.info('Bank account verification successful', {
            userId: req.user.id,
            accountNumber,
            bankCode,
            accountName: verificationData.account_name,
            bankName: verificationData.bank_name,
            requestId
        });

        res.status(200).json(
            successResponse(`Bank account verified successfully at ${verificationData.bank_name}`, 200, {
                accountName: verificationData.account_name,
                bankName: verificationData.bank_name
            }, requestId)
        );
    } catch (error) {
        logger.error('Error verifying bank account', {
            userId: req.user.id,
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse('Internal server error during bank verification', 500, null, requestId)
        );
    }
};

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
 * Transfers funds to another user's wallet or external bank account.
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
            description: z.string().max(200, 'Description cannot exceed 200 characters').optional(),
            bankCode: z.string().regex(/^\d{3}$/, 'Bank code must be 3 digits').optional(),
            recipientAccountName: z.string().min(1, 'Recipient account name is required').optional(),
            recipientBankName: z.string().min(1, 'Recipient bank name is required').optional()
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

        const { recipientAccountNumber, amount, description, bankCode, recipientAccountName, recipientBankName } = result.data;
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

        const senderWallet = await Wallet.findOne({ userId: senderId }).select('+balance');
        if (!senderWallet) {
            logger.warn('Sender wallet not found', { userId: senderId, requestId });
            return res.status(404).json(
                errorResponse('Sender wallet not found', 404, null, requestId)
            );
        }

        const recipient = await User.findOne({ accountNumber: recipientAccountNumber });

        if (recipient) {
            // Internal transfer
            const { senderTransaction, recipientTransaction } = await walletService.transferFunds({
                senderId,
                recipientAccountNumber,
                amount,
                description,
                requestId
            });

            logger.info('Internal transfer completed successfully', {
                senderId,
                senderAccountNumber: sender.accountNumber,
                recipientId: recipient._id,
                recipientAccountNumber,
                amount,
                requestId
            });

            res.status(200).json(
                successResponse('Transfer successful', 200, {
                    senderTransaction: {
                        amount: senderTransaction.amount,
                        reference: senderTransaction.reference,
                        status: senderTransaction.status,
                        target: senderTransaction.target,
                        targetBank: senderTransaction.targetBank
                    },
                    recipientTransaction: {
                        amount: recipientTransaction.amount,
                        reference: recipientTransaction.reference,
                        status: recipientTransaction.status,
                        targetBank: recipientTransaction.targetBank
                    },
                    balance: senderWallet.balance
                }, requestId)
            );
        } else {
            // External transfer
            if (!bankCode || !recipientAccountName || !recipientBankName) {
                logger.warn('Missing bank details for external transfer', {
                    userId: senderId,
                    recipientAccountNumber,
                    bankCode,
                    recipientAccountName,
                    recipientBankName,
                    requestId
                });
                return res.status(400).json(
                    errorResponse('Bank code, account name, and bank name are required for external transfers', 400, null, requestId)
                );
            }

            const { transaction, flutterwaveResponse } = await walletService.initiateExternalTransfer({
                userId: senderId,
                amount,
                recipientAccountNumber,
                recipientBankCode: bankCode,
                recipientAccountName,
                recipientBankName,
                description,
                requestId
            });

            logger.info('External transfer initiated successfully', {
                senderId,
                senderAccountNumber: sender.accountNumber,
                recipientAccountNumber,
                recipientBankCode: bankCode,
                recipientBankName,
                amount,
                reference: transaction.reference,
                requestId
            });

            res.status(200).json(
                successResponse('External transfer initiated successfully', 200, {
                    transaction: {
                        amount: transaction.amount,
                        reference: transaction.reference,
                        status: transaction.status,
                        target: transaction.target,
                        targetBank: transaction.targetBank,
                        transferFee: transaction.metadata?.transferFee || 0
                    },
                    flutterwaveTransferId: flutterwaveResponse.data.id,
                    balance: senderWallet.balance
                }, requestId)
            );
        }
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
            return res.status(400).json(
                errorResponse(`Payment ${status}`, 400, null, requestId)
            );
        } else {
            logger.warn('Unknown callback status', {
                requestId,
                transactionId: transaction_id,
                reference: tx_ref,
                status
            });
            return res.status(400).json(
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
 * Handles Flutterwave webhook for payment and transfer events.
 */
const handleFlutterwaveWebhook = async (req, res) => {
    const requestId = req.requestId;
    try {
        const input = req.validatedBody || req.body || {};
        const { 'event.type': eventType, transfer } = input;

        if (!eventType || !transfer) {
            logger.warn('Invalid or missing webhook parameters', {
                requestId,
                body: req.body,
                validatedBody: req.validatedBody
            });
            return res.status(400).json(
                errorResponse('Invalid or missing webhook parameters', 400, null, requestId)
            );
        }

        const { id: transactionId, reference, status, account_number, bank_name, amount } = transfer;

        logger.info('Flutterwave webhook received', {
            requestId,
            transactionId,
            reference,
            status,
            eventType
        });

        if (status === 'SUCCESSFUL' && eventType === 'transfer.completed') {
            const recipient = await User.findOne({ accountNumber: account_number });
            if (!recipient) {
                logger.warn('Recipient not found for webhook', {
                    requestId,
                    accountNumber: account_number,
                    transactionId,
                    reference
                });
                return res.status(404).json(
                    errorResponse('Recipient not found', 404, null, requestId)
                );
            }

            let wallet = await Wallet.findOne({ userId: recipient._id }).select('+balance');
            if (!wallet) {
                logger.warn('Wallet not found for webhook, creating new wallet', {
                    userId: recipient._id,
                    requestId
                });
                wallet = new Wallet({ userId: recipient._id, balance: 0, accountNumber: recipient.accountNumber });
                await wallet.save();
            }

            const existingTransaction = wallet.ledger.find(
                (tx) => tx.reference === reference
            );
            if (existingTransaction) {
                logger.warn('Duplicate webhook transaction detected', {
                    userId: recipient._id,
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

            const verifiedAmount = verificationData.data.amount;
            if (verifiedAmount !== amount) {
                logger.warn('Amount mismatch in webhook verification', {
                    requestId,
                    transactionId,
                    reference,
                    webhookAmount: amount,
                    verifiedAmount
                });
                return res.status(400).json(
                    errorResponse('Amount mismatch in verification', 400, null, requestId)
                );
            }

            const { wallet: updatedWallet } = await walletService.creditWallet({
                userId: recipient._id,
                amount: verifiedAmount,
                reference,
                source: 'external_transfer',
                description: `Received transfer via Flutterwave`,
                requestId,
                flutterwaveTxId: transactionId,
                senderAccountNumber: transfer.sender_account_number || null,
                senderBankName: transfer.sender_bank_name || null
            });

            logger.info('Webhook processed and wallet credited', {
                userId: recipient._id,
                accountNumber: wallet.accountNumber,
                amount: verifiedAmount,
                reference,
                requestId,
                source: 'external_transfer'
            });

            res.status(200).json(
                successResponse('Webhook processed successfully', 200, {
                    balance: updatedWallet.balance,
                    transactionId,
                    reference
                }, requestId)
            );
        } else {
            logger.warn('Webhook indicates non-successful transfer or unsupported event', {
                requestId,
                transactionId,
                reference,
                status,
                eventType
            });
            res.status(200).json(
                successResponse(`Webhook received for ${status} ${eventType}`, 200, null, requestId)
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
    getBalance,
    verifyBankAccount
};