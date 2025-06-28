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
 * Sends transaction notification email to the user's email.
 * @param {Object} user - User object
 * @param {Object} transaction - Transaction details
 * @param {string} requestId - Request ID
 */
const sendTransactionEmail = async (user, transaction, requestId) => {
    try {
        if (!user?.email) {
            logger.warn('User email is missing for transaction email', {
                userId: user?._id || 'unknown',
                transactionId: transaction._id,
                requestId
            });
            return;
        }
        if (!env.EMAIL_USER || !env.EMAIL_PASS || !env.EMAIL_SERVICE) {
            logger.warn('Email configuration is incomplete', {
                requestId,
                emailUser: env.EMAIL_USER ? 'set' : 'unset'
            });
            return;
        }

        const mailOptions = {
            to: user.email,
            subject: `Transaction ${transaction.type === 'credit' ? 'Received' : 'Sent'} - NEG AI Banking Platform`,
            text: `
        Dear ${user.firstName} ${user.lastName},
        
        A ${transaction.type} transaction has been processed in your wallet (Account Number: ${user.accountNumber}):
        - Amount: NGN ${transaction.amount.toFixed(2)}
        - Reference: ${transaction.reference}
        - Status: ${transaction.status}
        - Description: ${transaction.description || 'No description'}
        - Target Account: ${transaction.target || 'N/A'}
        - Timestamp: ${new Date().toISOString()}
        
        For support, contact support@negaibanking.com.
        Request ID: ${requestId}
      `,
            requestId
        };

        logger.debug('Preparing to send transaction email', {
            userId: user._id,
            email: user.email,
            accountNumber: user.accountNumber,
            transactionId: transaction._id,
            requestId,
            recipient: mailOptions.to
        });

        await sendErrorAlert({ message: `Transaction email sent for ${transaction.type}`, type: 'transaction' }, mailOptions);
        logger.info('Transaction email sent', {
            userId: user._id,
            email: user.email,
            accountNumber: user.accountNumber,
            transactionId: transaction._id,
            requestId
        });
    } catch (error) {
        logger.error('Failed to send transaction email', {
            userId: user?._id || 'unknown',
            email: user?.email || 'unknown',
            accountNumber: user?.accountNumber || 'unknown',
            transactionId: transaction._id,
            requestId,
            error: error.message,
            stack: error.stack
        });
    }
};

/**
 * Initiates a payment with Flutterwave.
 * @param {Object} user - User object
 * @param {number} amount - Amount to fund
 * @param {string} reference - Unique transaction reference
 * @param {string} requestId - Request ID
 * @param {string} accountNumber - User's account number
 * @returns {Object} Payment initiation response
 */
const initiateFlutterwavePayment = async (user, amount, reference, requestId, accountNumber) => {
    try {
        if (!env.FLUTTERWAVE_SECRET_KEY) {
            throw new Error('Flutterwave secret key is not defined');
        }

        // Verify accountNumber matches user's accountNumber
        if (accountNumber !== user.accountNumber) {
            logger.warn('Account number mismatch for funding', {
                userId: user._id,
                email: user.email,
                providedAccountNumber: accountNumber,
                userAccountNumber: user.accountNumber,
                requestId
            });
            throw new Error('Invalid account number');
        }

        logger.debug('Raw amount received in initiateFlutterwavePayment', {
            userId: user._id,
            email: user.email,
            accountNumber: user.accountNumber,
            amount,
            amountType: typeof amount,
            reference,
            requestId
        });

        const validatedAmount = Number(amount);
        if (isNaN(validatedAmount) || validatedAmount <= 0) {
            logger.warn('Invalid amount for Flutterwave payment', {
                userId: user._id,
                email: user.email,
                accountNumber: user.accountNumber,
                amount,
                amountType: typeof amount,
                validatedAmount,
                requestId
            });
            throw new Error('Amount must be a positive number');
        }

        const response = await axios.post(
            'https://api.flutterwave.com/v3/payments',
            {
                tx_ref: reference,
                amount: validatedAmount,
                currency: 'NGN',
                redirect_url: 'https://068d-197-210-29-66.ngrok-free.app/api/wallet/callback',
                customer: {
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`
                },
                customizations: {
                    title: 'NEG AI Banking Wallet Funding',
                    description: `Fund wallet with NGN ${validatedAmount.toFixed(2)} for account ${user.accountNumber}`
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
            accountNumber: user.accountNumber,
            reference,
            requestId,
            amount: validatedAmount,
            flutterwaveResponse: {
                status: response.data.status,
                message: response.data.message,
                data: {
                    link: response.data.data.link,
                    tx_ref: response.data.data.tx_ref
                }
            }
        });

        return response.data;
    } catch (error) {
        logger.error('Failed to initiate Flutterwave payment', {
            userId: user._id,
            email: user.email,
            accountNumber: user.accountNumber,
            reference,
            requestId,
            amount,
            error: error.response?.data || error.message,
            stack: error.stack
        });
        if (env.EMAIL_USER) {
            logger.debug('Preparing to send error email for payment initiation failure', {
                userId: user._id,
                email: user.email,
                accountNumber: user.accountNumber,
                requestId,
                recipient: env.EMAIL_USER
            });
            await sendErrorAlert(
                { message: 'Failed to initiate Flutterwave payment', type: 'error' },
                {
                    to: env.EMAIL_USER,
                    subject: 'Payment Initiation Failed - NEG AI Banking Platform',
                    text: `Failed to initiate payment for user ${user.email} (Account: ${user.accountNumber}). Error: ${error.message}. Request ID: ${requestId}`,
                    requestId
                }
            );
        }
        throw new Error(`Failed to initiate payment with Flutterwave: ${error.response?.data?.message || error.message}`);
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
            amount: response.data.data?.amount,
            tx_ref: response.data.data?.tx_ref
        });

        return response.data;
    } catch (error) {
        logger.error('Failed to verify Flutterwave payment', {
            transactionId,
            requestId,
            error: error.response?.data || error.message,
            stack: error.stack
        });
        if (env.EMAIL_USER) {
            logger.debug('Preparing to send error email for payment verification failure', {
                transactionId,
                requestId,
                recipient: env.EMAIL_USER
            });
            await sendErrorAlert(
                { message: 'Failed to verify Flutterwave payment', type: 'error' },
                {
                    to: env.EMAIL_USER,
                    subject: 'Payment Verification Failed - NEG AI Banking Platform',
                    text: `Failed to verify payment for transaction ${transactionId}. Error: ${error.message}. Request ID: ${requestId}`,
                    requestId
                }
            );
        }
        throw new Error(`Failed to verify payment with Flutterwave: ${error.response?.data?.message || error.message}`);
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

        logger.debug('Fetched wallet for credit', {
            userId,
            walletId: wallet._id,
            accountNumber: wallet.accountNumber,
            rawBalance: wallet.balance,
            balanceType: typeof wallet.balance,
            requestId
        });

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
        if (user) {
            await sendTransactionEmail(user, transaction, requestId);
        } else {
            logger.warn('User not found for email notification', {
                userId,
                reference,
                requestId
            });
        }

        logger.info('Wallet credited successfully', {
            userId,
            accountNumber: wallet.accountNumber,
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
        if (env.EMAIL_USER) {
            logger.debug('Preparing to send error email for wallet credit failure', {
                userId,
                reference,
                requestId,
                recipient: env.EMAIL_USER
            });
            await sendErrorAlert(
                { message: 'Error crediting wallet', type: 'error' },
                {
                    to: env.EMAIL_USER,
                    subject: 'Wallet Credit Failed - NEG AI Banking Platform',
                    text: `Failed to credit wallet for user ${userId}. Error: ${error.message}. Request ID: ${requestId}`,
                    requestId
                }
            );
        }
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

        logger.debug('Fetched wallet for debit', {
            userId,
            walletId: wallet._id,
            accountNumber: wallet.accountNumber,
            rawBalance: wallet.balance,
            balanceType: typeof wallet.balance,
            requestId
        });

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

        await wallet.hasSufficientBalance(amount);

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
        if (user) {
            await sendTransactionEmail(user, transaction, requestId);
        } else {
            logger.warn('User not found for email notification', {
                userId,
                reference,
                requestId
            });
        }

        logger.info('Wallet debited successfully', {
            userId,
            accountNumber: wallet.accountNumber,
            amount,
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
        if (env.EMAIL_USER) {
            logger.debug('Preparing to send error email for wallet debit failure', {
                userId,
                reference,
                requestId,
                recipient: env.EMAIL_USER
            });
            await sendErrorAlert(
                { message: 'Error debiting wallet', type: 'error' },
                {
                    to: env.EMAIL_USER,
                    subject: 'Wallet Debit Failed - NEG AI Banking Platform',
                    text: `Failed to debit wallet for user ${userId}. Error: ${error.message}. Request ID: ${requestId}`,
                    requestId
                }
            );
        }
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
    recipientAccountNumber,
    amount,
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

        logger.debug('Fetched sender wallet for transfer', {
            senderId,
            walletId: senderWallet._id,
            accountNumber: senderWallet.accountNumber,
            rawBalance: senderWallet.balance,
            balanceType: typeof senderWallet.balance,
            amount,
            requestId
        });

        const recipient = await User.findOne({ accountNumber: recipientAccountNumber });
        if (!recipient) {
            throw new Error('Recipient not found');
        }

        const recipientWallet = await Wallet.findOne({ userId: recipient._id })
            .session(session)
            .select('+balance');
        if (!recipientWallet) {
            throw new Error('Recipient wallet not found');
        }

        logger.debug('Fetched recipient wallet for transfer', {
            recipientId: recipient._id,
            walletId: recipientWallet._id,
            accountNumber: recipientWallet.accountNumber,
            rawBalance: recipientWallet.balance,
            balanceType: typeof recipientWallet.balance,
            amount,
            requestId
        });

        // Generate unique references for sender and recipient transactions
        const senderReference = `TRANSFER-SENDER-${uuidv4()}`;
        const recipientReference = `TRANSFER-RECIPIENT-${uuidv4()}`;

        const senderExistingTransaction = senderWallet.ledger.find(
            (tx) => tx.reference === senderReference
        );
        const recipientExistingTransaction = recipientWallet.ledger.find(
            (tx) => tx.reference === recipientReference
        );
        if (senderExistingTransaction || recipientExistingTransaction) {
            logger.warn('Duplicate transfer detected', {
                senderId,
                recipientAccountNumber,
                senderReference,
                recipientReference,
                requestId
            });
            throw new Error('Transaction already processed');
        }

        await senderWallet.hasSufficientBalance(amount);

        senderWallet.balance -= amount;
        const senderTransaction = {
            type: 'debit',
            amount,
            reference: senderReference,
            status: 'completed',
            source: 'transfer',
            target: recipient.accountNumber,
            description,
            createdBy: senderId
        };
        senderWallet.ledger.push(senderTransaction);

        recipientWallet.balance += amount;
        const recipientTransaction = {
            type: 'credit',
            amount,
            reference: recipientReference,
            status: 'completed',
            source: 'transfer',
            target: null,
            description: `Received from ${senderWallet.accountNumber}`,
            createdBy: senderId
        };
        recipientWallet.ledger.push(recipientTransaction);

        await senderWallet.save({ session });
        await recipientWallet.save({ session });

        await session.commitTransaction();

        const sender = await User.findById(senderId);
        if (sender) {
            sendTransactionEmail(sender, senderTransaction, requestId).catch(() => {
                logger.error('Async sender transaction email failed', { senderId, requestId });
            });
        }
        if (recipient) {
            sendTransactionEmail(recipient, recipientTransaction, requestId).catch(() => {
                logger.error('Async recipient transaction email failed', { recipientId: recipient._id, requestId });
            });
        }

        logger.info('Transfer completed successfully', {
            senderId,
            recipientId: recipient._id,
            senderAccountNumber: senderWallet.accountNumber,
            recipientAccountNumber,
            amount,
            senderReference,
            recipientReference,
            requestId
        });

        return { senderTransaction, recipientTransaction };
    } catch (error) {
        await session.abortTransaction();
        logger.error('Error transferring funds', {
            senderId,
            recipientAccountNumber,
            requestId,
            error: error.message,
            stack: error.stack
        });
        if (env.EMAIL_USER) {
            logger.debug('Preparing to send error email for transfer failure', {
                senderId,
                recipientAccountNumber,
                requestId,
                recipient: env.EMAIL_USER
            });
            await sendErrorAlert(
                { message: 'Error transferring funds', type: 'error' },
                {
                    to: env.EMAIL_USER,
                    subject: 'Transfer Failed - NEG AI Banking Platform',
                    text: `Failed to transfer funds from ${senderId} to account ${recipientAccountNumber}. Error: ${error.message}. Request ID: ${requestId}`,
                    requestId
                }
            );
        }
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