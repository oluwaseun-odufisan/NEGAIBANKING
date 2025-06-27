import mongoose from 'mongoose';
import mongooseEncryption from 'mongoose-encryption';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Wallet schema for the NEG AI Banking Platform.
 * Stores user wallet data with encrypted balance and transaction ledger.
 */
const walletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: [true, 'User ID is required'],
            unique: true,
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
        next();
    } catch (error) {
        logger.error('Wallet validation error', {
            error: error.message,
            stack: error.stack,
            walletId: this._id
        });
        throw error;
    }
});



export const Wallet = mongoose.model('Wallet', walletSchema);