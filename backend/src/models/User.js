// src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import mongooseEncryption from 'mongoose-encryption';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * User schema for the NEG AI Banking Platform.
 * Includes encrypted fields (NIN, password reset token), role-based access,
 * and session tracking for banking-grade security and auditability.
 * @type {mongoose.Schema}
 */
const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
            index: true // Ensures efficient queries; unique: true creates index
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
            set: (value) => (value ? value.replace(/\s/g, '') : value) // Remove spaces
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
            default: false // For KYC verification status
        },
        sessions: [
            {
                refreshToken: {
                    type: String,
                    select: false
                },
                deviceId: {
                    type: String,
                    required: true
                },
                ipAddress: {
                    type: String,
                    required: true
                },
                userAgent: {
                    type: String,
                    required: true
                },
                createdAt: {
                    type: Date,
                    default: Date.now
                },
                expiresAt: {
                    type: Date,
                    required: true
                }
            }
        ],
        passwordResetToken: {
            type: String,
            select: false
        },
        passwordResetExpires: {
            type: Date,
            select: false
        },
        lastLogin: {
            type: Date
        }
    },
    {
        timestamps: true, // createdAt, updatedAt for auditing
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

// Hash password before saving
userSchema.pre('save', async function (next) {
    try {
        if (this.isModified('password')) {
            this.password = await bcrypt.hash(this.password, 12);
        }
        next();
    } catch (error) {
        logger.error('Error hashing password', {
            error: error.message,
            stack: error.stack,
            email: this.email
        });
        next(error);
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

// Create index for sessions.refreshToken
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

export const User = mongoose.model('User', userSchema);