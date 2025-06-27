// src/services/walletService.js
import mongoose from 'mongoose';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { Wallet } from '../models/Wallet.js';
import { User } from '../models/User.js';
import { sendErrorAlert } from '../utils/email.js';

/**
 * Wallet service for NEG AI Banking Platform.
 * Handles credit/debit operations with MongoDB transactions and Flutterwave integration.
 */

/**
 * Sends transaction notification email.
 * @param {Object} user - User object
 * @param {Object} transaction - Transaction details
 * @param {string} requestId - Request ID
 */
const sendTransactionEmail = async (user, transaction, requestId) => {
    try {
        if (!env.EMAIL_USER || !env.EMAIL_PASS || !env.EMAIL_SERVICE) {
            throw new Error('Email configuration is incomplete');
        }

        const mailOptions = {
            from: env.EMAIL_USER,
            to: user.email,
            subject: `Transaction ${transaction.type === 'credit' ? 'Received' : 'Sent'} - NEG AI Banking Platform`,
            text: `
        Dear ${user.email},
        
        A ${transaction.type} transaction has been processed in your wallet:
        - Amount: NGN ${transaction.amount.toFixed(2)}
        - Reference: ${transaction.reference}
        - Status: ${transaction.status}
        - Description: ${transaction.description || 'No description'}
        - Timestamp: ${new Date().toISOString()}
        
        For support, contact support@negaibanking.com.
        Request ID: ${requestId}
      `,
            requestId
        };

        await sendErrorAlert({ message: `Transaction email sent for ${transaction.type}` }, mailOptions);
        logger.info('Transaction email sent', {
            userId: user._id,
            email: user.email,
            transactionId: transaction._id,
            requestId
        });
    } catch (error) {
        logger.error('Failed to send transaction email', {
            userId: user._id,
            email: user.email,
            transactionId: transaction._id,
            requestId,
            error: error.message,
            stack: error.stack
        });
        // Do not throw error to avoid blocking wallet operations
    }
};

/**
 * Initiates a payment with Flutterwave.
 * @param {Object} user - User object
 * @param {number} amount - Amount to fund
 * @param {string} reference - Unique transaction reference
 * @param {string} requestId - Request ID
 * @returns {Object} Payment initiation response
 */
const initiateFlutterwavePayment = async (user, amount, reference, requestId) => {
    try {
        if (!env.FLUTTERWAVE_SECRET_KEY) {
            throw new Error('Flutterwave secret key is not defined');
        }
        if (!env.FRONTEND_URL) {
            throw new Error('Frontend URL is not defined');
        }

        const response = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            {
                tx_ref: reference,
                amount,
                currency: 'NGN',
                redirect_url: `${env.FRONTEND_URL}/payment-callback`,
                customer: {
                    email: user.email,
                    name: user.email
                },
                customizations: {
                    title: 'NEG AI Banking Wallet Funding',
                    description: `Fund wallet with NGN ${amount}`
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logger.info('Flutterwave payment initiated', {
            userId: user._id,
            email: user.email,
            reference,
            requestId,
            flutterwaveResponse: response.data
        });

        return response.data;
    } catch (error) {
        logger.error('Failed to initiate Flutterwave payment', {
            userId: user._id,
            email: user.email,
            reference,
            requestId,
            error: error.response?.data || error.message,
            stack: error.stack
        });
        throw new Error('Failed to initiate payment with Flutterwave');
    }
};

/**
 * Verifies a Flutterwave payment.
 * @param {string} transactionId - Flutterwave transaction ID
 * @param {string} requestId - Request ID
 * @returns {Object} Verification response
 */
const verifyFlutterwavePayment = async (transactionId, requestId) => {
    try {
        if (!env.FLUTTERWAVE_SECRET_KEY) {
            throw new Error('Flutterwave secret key is not defined');
        }

        const response = await axios.get(
            `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
            {
                headers: {
                    Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`
                }
            }
        );

        logger.info('Flutterwave payment verified', {
            transactionId,
            requestId,
            status: response.data.status,
            amount: response.data.data.amount
        });

        return response.data;
    } catch (error) {
        logger.error('Failed to verify Flutterwave payment', {
            transactionId,
            requestId,
            error: error.response?.data || error.message,
            stack: error.stack
        });
        throw new Error('Failed to verify payment with Flutterwave');
    }
};

/**
 * Credits a wallet using a MongoDB transaction.
 * @param {Object} params - Parameters
 * @returns {Object} Updated wallet and transaction
 */
const creditWallet = async ({
    userId,
    amount,
    reference,
    source = 'flutterwave',
    description,
    requestId,
    flutterwaveTxId
}) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const wallet = await Wallet.findOne({ userId })
            .session(session)
            .select('+balance');
        if (!wallet) {
            throw new Error('Wallet not found');
        }

        // Check for duplicate transaction
        const existingTransaction = wallet.ledger.find(
            (tx) => tx.reference === reference
        );
        if (existingTransaction) {
            logger.warn('Duplicate transaction detected', {
                userId,
                reference,
                requestId
            });
            throw new Error('Transaction already processed');
        }

        // Update balance and add transaction
        wallet.balance += amount;
        const transaction = {
            type: 'credit',
            amount,
            reference,
            status: 'completed',
            source,
            description,
            createdBy: userId,
            metadata: flutterwaveTxId ? { flutterwaveTxId } : {}
        };
        wallet.ledger.push(transaction);

        await wallet.save({ session });

        await session.commitTransaction();

        const user = await User.findById(userId);
        await sendTransactionEmail(user, transaction, requestId);

        logger.info('Wallet credited successfully', {
            userId,
            amount,
            reference,
            requestId
        });

        return { wallet, transaction };
    } catch (error) {
        await session.abortTransaction();
        logger.error('Error crediting wallet', {
            userId,
            reference,
            requestId,
            error: error.message,
            stack: error.stack
        });
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Debits a wallet using a MongoDB transaction.
 * @param {Object} params - Parameters
 * @returns {Object} Updated wallet and transaction
 */
const debitWallet = async ({
    userId,
    amount,
    reference,
    target,
    description,
    requestId
}) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const wallet = await Wallet.findOne({ userId })
            .session(session)
            .select('+balance');
        if (!wallet) {
            throw new Error('Wallet not found');
        }

        // Check for duplicate transaction
        const existingTransaction = wallet.ledger.find(
            (tx) => tx.reference === reference
        );
        if (existingTransaction) {
            logger.warn('Duplicate transaction detected', {
                userId,
                reference,
                requestId
            });
            throw new Error('Transaction already processed');
        }

        // Validate balance
        await wallet.hasSufficientBalance(amount);

        // Update balance and add transaction
        wallet.balance -= amount;
        const transaction = {
            type: 'debit',
            amount,
            reference,
            status: 'completed',
            source: 'transfer',
            target,
            description,
            createdBy: userId
        };
        wallet.ledger.push(transaction);

        await wallet.save({ session });

        await session.commitTransaction();

        const user = await User.findById(userId);
        await sendTransactionEmail(user, transaction, requestId);

        logger.info('Wallet debited successfully', {
            userId,
            amount,
            reference,
            target,
            requestId
        });

        return { wallet, transaction };
    } catch (error) {
        await session.abortTransaction();
        logger.error('Error debiting wallet', {
            userId,
            reference,
            requestId,
            error: error.message,
            stack: error.stack
        });
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Transfers funds between wallets with MongoDB transaction.
 * @param {Object} params - Parameters
 * @returns {Object} Sender and receiver transactions
 */
const transferFunds = async ({
    senderId,
    recipientEmail,
    amount,
    reference,
    description,
    requestId
}) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const senderWallet = await Wallet.findOne({ userId: senderId })
            .session(session)
            .select('+balance');
        if (!senderWallet) {
            throw new Error('Sender wallet not found');
        }

        const recipient = await User.findOne({ email: recipientEmail });
        if (!recipient) {
            throw new Error('Recipient not found');
        }

        const recipientWallet = await Wallet.findOne({ userId: recipient.id })
            .session(session)
            .select('+balance');
        if (!recipientWallet) {
            throw new Error('Recipient wallet not found');
        }

        // Check for duplicate transaction
        const existingTransaction = senderWallet.ledger.find(
            (tx) => tx.reference === reference
        );
        if (existingTransaction) {
            logger.warn('Duplicate transfer detected', {
                senderId,
                reference,
                requestId
            });
            throw new Error('Transaction already processed');
        }

        // Validate sender balance
        await senderWallet.hasSufficientBalance(amount);

        // Debit sender
        senderWallet.balance -= amount;
        const senderTransaction = {
            type: 'debit',
            amount,
            reference,
            status: 'completed',
            source: 'transfer',
            target: recipient.email,
            description,
            createdBy: senderId
        };
        senderWallet.ledger.push(senderTransaction);

        // Credit recipient
        recipientWallet.balance += amount;
        const recipientTransaction = {
            type: 'credit',
            amount,
            reference,
            status: 'completed',
            source: 'transfer',
            target: null,
            description: `Received from ${senderId}`,
            createdBy: senderId
        };
        recipientWallet.ledger.push(recipientTransaction);

        await senderWallet.save({ session });
        await recipientWallet.save({ session });

        await session.commitTransaction();

        // Send emails asynchronously
        sendTransactionEmail(
            await User.findById(senderId),
            senderTransaction,
            requestId
        ).catch(() => {
            logger.error('Async sender transaction email failed', { senderId, requestId });
        });
        sendTransactionEmail(recipient, recipientTransaction, requestId).catch(() => {
            logger.error('Async recipient transaction email failed', { recipientId: recipient._id, requestId });
        });

        logger.info('Transfer completed successfully', {
            senderId,
            recipientId: recipient._id,
            amount,
            reference,
            requestId
        });

        return { senderTransaction, recipientTransaction };
    } catch (error) {
        await session.abortTransaction();
        logger.error('Error transferring funds', {
            senderId,
            recipientEmail,
            reference,
            requestId,
            error: error.message,
            stack: error.stack
        });
        throw error;
    } finally {
        session.endSession();
    }
};

export default {
    creditWallet,
    debitWallet,
    transferFunds,
    initiateFlutterwavePayment,
    verifyFlutterwavePayment
};