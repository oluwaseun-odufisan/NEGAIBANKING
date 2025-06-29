import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import mongooseEncryption from 'mongoose-encryption';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * User schema for the NEG AI Banking Platform.
 * Includes encrypted fields (NIN, password reset token), role-based access,
 * session tracking, account number generated from phone number, and bank name.
 * @type {mongoose.Schema}
 */
const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: [true, 'First name is required'],
            trim: true,
            minlength: [2, 'First name must be at least 2 characters'],
            maxlength: [50, 'First name cannot exceed 50 characters']
        },
        lastName: {
            type: String,
            required: [true, 'Last name is required'],
            trim: true,
            minlength: [2, 'Last name must be at least 2 characters'],
            maxlength: [50, 'Last name cannot exceed 50 characters']
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
            index: true
        },
        phoneNumber: {
            type: String,
            required: [true, 'Phone number is required'],
            unique: true,
            trim: true,
            match: [/^\+234\d{10}$/, 'Phone number must be a valid Nigerian number starting with +234 followed by 10 digits'],
            set: (value) => (value ? value.replace(/\s/g, '') : value)
        },
        accountNumber: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            match: [/^\d{10}$/, 'Account number must be 10 digits'],
            index: true
        },
        bankName: {
            type: String,
            default: 'NEG AI Bank',
            trim: true
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false
        },
        nin: {
            type: String,
            trim: true,
            sparse: true,
            unique: true,
            select: false,
            set: (value) => (value ? value.replace(/\s/g, '') : value)
        },
        role: {
            type: String,
            enum: {
                values: ['user', 'admin'],
                message: 'Role must be either "user" or "admin"'
            },
            default: 'user'
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        sessions: [
            {
                refreshToken: { type: String, select: false },
                deviceId: { type: String, required: true },
                ipAddress: { type: String, required: true },
                userAgent: { type: String, required: true },
                createdAt: { type: Date, default: Date.now },
                expiresAt: { type: Date, required: true }
            }
        ],
        passwordResetToken: { type: String, select: false },
        passwordResetExpires: { type: Date, select: false },
        lastLogin: { type: Date }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Encrypt sensitive fields (NIN, passwordResetToken)
userSchema.plugin(mongooseEncryption, {
    secret: env.ENCRYPTION_KEY,
    additionalSecret: env.ENCRYPTION_IV,
    encryptedFields: ['nin', 'passwordResetToken']
});

// Generate account number from phone number before saving
userSchema.pre('save', async function (next) {
    try {
        if (this.isModified('phoneNumber') && this.phoneNumber) {
            const phoneNumber = this.phoneNumber.replace(/\s/g, '');
            if (phoneNumber.startsWith('+234') && phoneNumber.length === 14) {
                this.accountNumber = phoneNumber.slice(4); // Extract last 10 digits
                logger.debug('Generated account number from phone number', {
                    userId: this._id,
                    phoneNumber,
                    accountNumber: this.accountNumber
                });
            } else {
                throw new Error('Invalid phone number format for account number generation');
            }
        }
        if (this.isModified('password')) {
            this.password = await bcrypt.hash(this.password, 12);
        }
        next();
    } catch (error) {
        logger.error('Error in user pre-save hook', {
            error: error.message,
            stack: error.stack,
            email: this.email
        });
        next(error);
    }
});

// Create wallet on user registration with transaction
userSchema.post('save', async function (doc, next) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { Wallet } = await import('./Wallet.js');

        const existingWallet = await Wallet.findOne({ userId: this._id }).session(session);
        if (existingWallet) {
            logger.warn('Wallet already exists for user', {
                userId: this._id,
                email: this.email,
                walletId: existingWallet._id
            });
            await session.commitTransaction();
            return next();
        }

        const wallet = new Wallet({ userId: this._id, balance: 0, accountNumber: this.accountNumber });
        await wallet.save({ session });

        await session.commitTransaction();

        logger.info('Wallet created successfully for user', {
            userId: this._id,
            email: this.email,
            walletId: wallet._id,
            accountNumber: this.accountNumber
        });

        next();
    } catch (error) {
        await session.abortTransaction();
        logger.error('Error creating wallet for user', {
            userId: this._id,
            email: this.email,
            error: error.message,
            stack: error.stack
        });
        throw new Error(`Wallet creation failed: ${error.message}`);
    } finally {
        session.endSession();
    }
});

// Compare password for login
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        logger.error('Error comparing password', {
            error: error.message,
            stack: error.stack,
            email: this.email
        });
        throw error;
    }
};

// Create index for sessions.refreshToken and accountNumber
userSchema.index({ 'sessions.refreshToken': 1 });

/**
 * Removes expired sessions from user document.
 * @returns {Promise<void>}
 */
userSchema.methods.cleanupSessions = async function () {
    try {
        this.sessions = this.sessions.filter(
            (session) => session.expiresAt > new Date()
        );
        await this.save();
        logger.info('Expired sessions cleaned up', { userId: this._id });
    } catch (error) {
        logger.error('Error cleaning up sessions', {
            userId: this._id,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

logger.info('User model initialized', { module: 'User' });

export const User = mongoose.model('User', userSchema);