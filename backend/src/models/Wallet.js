import mongoose from 'mongoose';
import mongooseEncryption from 'mongoose-encryption';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Wallet schema for the NEG AI Banking Platform.
 * Stores user wallet data with encrypted balance, transaction ledger, and account number.
 */
const walletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: [true, 'User ID is required'],
            unique: true,
            index: true
        },
        accountNumber: {
            type: String,
            required: [true, 'Account number is required'],
            unique: true,
            match: [/^\d{10}$/, 'Account number must be 10 digits'],
            index: true
        },
        balance: {
            type: Number,
            default: 0,
            min: [0, 'Balance cannot be negative'],
            select: false
        },
        ledger: [
            {
                type: {
                    type: String,
                    enum: ['credit', 'debit'],
                    required: true
                },
                amount: {
                    type: Number,
                    required: true,
                    min: [0, 'Amount must be positive']
                },
                reference: {
                    type: String,
                    required: true,
                    unique: true
                },
                status: {
                    type: String,
                    enum: ['pending', 'completed', 'failed'],
                    default: 'pending'
                },
                source: {
                    type: String,
                    enum: ['flutterwave', 'transfer'],
                    required: true
                },
                target: {
                    type: String,
                    default: null
                },
                description: {
                    type: String,
                    trim: true
                },
                createdAt: {
                    type: Date,
                    default: Date.now
                }
            }
        ]
    },
    {
        timestamps: true
    }
);

// Encrypt balance field
walletSchema.plugin(mongooseEncryption, {
    secret: env.ENCRYPTION_KEY,
    additionalSecret: env.ENCRYPTION_IV,
    encryptedFields: ['balance']
});

// Pre-save validation for ledger
walletSchema.pre('save', async function (next) {
    try {
        if (this.isModified('ledger')) {
            const newEntries = this.ledger.filter((entry) => entry.isNew);
            for (const entry of newEntries) {
                if (entry.amount <= 0) {
                    throw new Error('Transaction amount must be positive');
                }
                if (!entry.reference) {
                    throw new Error('Transaction reference is required');
                }
            }
        }
        logger.debug('Wallet pre-save validation passed', {
            walletId: this._id,
            userId: this.userId,
            balance: this.balance,
            accountNumber: this.accountNumber
        });
        next();
    } catch (error) {
        logger.error('Wallet validation error', {
            error: error.message,
            stack: error.stack,
            walletId: this._id,
            userId: this.userId
        });
        throw error;
    }
});

/**
 * Checks if the wallet has sufficient balance for a transaction.
 * @param {number} amount - Amount to check
 * @throws {Error} If balance is insufficient or invalid
 */
walletSchema.methods.hasSufficientBalance = async function (amount) {
    try {
        logger.debug('Raw balance before conversion', {
            walletId: this._id,
            userId: this.userId,
            rawBalance: this.balance,
            balanceType: typeof this.balance,
            amount
        });

        const balance = Number(this.balance);
        if (isNaN(balance) || this.balance === null || this.balance === undefined) {
            throw new Error(`Invalid balance: ${this.balance}. Possible decryption failure.`);
        }
        if (balance < amount) {
            throw new Error(`Insufficient balance: ${balance} is less than ${amount}`);
        }
        logger.debug('Sufficient balance verified', {
            walletId: this._id,
            userId: this.userId,
            balance,
            amount
        });
    } catch (error) {
        logger.error('Insufficient balance check failed', {
            walletId: this._id,
            userId: this.userId,
            rawBalance: this.balance,
            balanceType: typeof this.balance,
            amount,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

export const Wallet = mongoose.model('Wallet', walletSchema);