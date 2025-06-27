// src/controllers/authController.js
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import zxcvbn from 'zxcvbn';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { sendErrorAlert } from '../utils/email.js';
import { env } from '../config/env.js'; // Ensure env is imported at the top

/**
 * Generates JWT access and refresh tokens.
 * @param {Object} user - User object with id, email, role
 * @returns {Object} Access and refresh tokens
 */
const generateTokens = (user) => {
    try {
        if (!env.JWT_SECRET || !env.JWT_REFRESH_SECRET) {
            throw new Error('JWT secrets are not defined');
        }
        const accessToken = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        const refreshToken = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            env.JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );
        return { accessToken, refreshToken };
    } catch (error) {
        logger.error('Error generating tokens', {
            userId: user.id,
            email: user.email,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

/**
 * Sends welcome email to new users.
 * @param {Object} user - User object
 * @param {string} requestId - Request ID
 */
const sendWelcomeEmail = async (user, requestId) => {
    try {
        const mailOptions = {
            from: env.EMAIL_USER,
            to: user.email,
            subject: 'Welcome to NEG AI Banking Platform',
            text: `
        Welcome to NEG AI Banking Platform, ${user.email}!
        
        Your account has been successfully created. To complete your profile and access all features, please complete your KYC verification.
        
        For support, contact support@negaibanking.com.
        
        Timestamp: ${new Date().toISOString()}
        Request ID: ${requestId}
      `,
            requestId
        };

        await sendErrorAlert({ message: 'Welcome email sent' }, mailOptions);
        logger.info('Welcome email sent', { userId: user._id, email: user.email, requestId });
    } catch (error) {
        logger.error('Failed to send welcome email', {
            userId: user._id,
            email: user.email,
            requestId,
            error: error.message,
            stack: error.stack
        });
        // Do not throw error to avoid blocking registration
    }
};

/**
 * Sends password reset email.
 * @param {Object} user - User object
 * @param {string} token - Password reset token
 * @param {string} requestId - Request ID
 */
const sendPasswordResetEmail = async (user, token, requestId) => {
    try {
        const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
        const mailOptions = {
            from: env.EMAIL_USER,
            to: user.email,
            subject: 'Password Reset Request - NEG AI Banking Platform',
            text: `
        Dear ${user.email},
        
        You requested a password reset. Click the link below to reset your password:
        ${resetUrl}
        
        This link expires in 24 hours. If you did not request this, please contact support@negaibanking.com.
        
        Timestamp: ${new Date().toISOString()}
        Request ID: ${requestId}
      `,
            requestId
        };

        await sendErrorAlert({ message: 'Password reset email sent' }, mailOptions);
        logger.info('Password reset email sent', { userId: user._id, email: user.email, requestId });
    } catch (error) {
        logger.error('Failed to send password reset email', {
            userId: user._id,
            email: user.email,
            requestId,
            error: error.message,
            stack: error.stack
        });
        // Do not throw error to avoid blocking password reset
    }
};

/**
 * Creates a wallet for a user with retry logic.
 * @param {Object} user - User object
 * @param {string} requestId - Request ID
 * @returns {Object} Created wallet
 */
const createWalletWithRetry = async (user, requestId, maxRetries = 3) => {
    let attempt = 0;
    let wallet = null;

    // Dynamic import to ensure Wallet model is available
    const { Wallet } = await import('../models/Wallet.js');

    while (attempt < maxRetries && !wallet) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const existingWallet = await Wallet.findOne({ userId: user._id }).session(session);
            if (existingWallet) {
                logger.warn('Wallet already exists during retry', {
                    userId: user._id,
                    email: user.email,
                    walletId: existingWallet._id,
                    requestId
                });
                await session.commitTransaction();
                return existingWallet;
            }

            wallet = new Wallet({ userId: user._id, balance: 0 });
            await wallet.save({ session });

            await session.commitTransaction();

            logger.info('Wallet created successfully on attempt ' + (attempt + 1), {
                userId: user._id,
                email: user.email,
                walletId: wallet._id,
                requestId
            });

            return wallet;
        } catch (error) {
            await session.abortTransaction();
            attempt++;
            logger.error('Wallet creation failed on attempt ' + attempt, {
                userId: user._id,
                email: user.email,
                requestId,
                error: error.message,
                stack: error.stack
            });

            if (attempt >= maxRetries) {
                throw new Error(`Wallet creation failed after ${maxRetries} attempts: ${error.message}`);
            }

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        } finally {
            session.endSession();
        }
    }
};

/**
 * Register a new user with strong password validation and wallet creation.
 */
export const register = async (req, res) => {
    const requestId = req.requestId;
    try {
        logger.debug('register: Input received', {
            requestId,
            body: req.body,
            sanitizedBody: req.sanitizedBody,
            validatedBody: req.validatedBody
        });

        if (!req.validatedBody) {
            logger.warn('Missing validated body in registration request', {
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody
            });
            return res.status(400).json(
                errorResponse(
                    'Invalid request: No validated data provided',
                    400,
                    null,
                    requestId
                )
            );
        }

        const { email, password, nin } = req.validatedBody;
        const passwordStrength = zxcvbn(password);
        if (passwordStrength.score < 3) {
            logger.warn('Weak password attempt during registration', {
                requestId,
                email,
                score: passwordStrength.score
            });
            return res.status(400).json(
                errorResponse(
                    'Password is too weak. Use a stronger password with letters, numbers, and symbols.',
                    400,
                    { score: passwordStrength.score, feedback: passwordStrength.feedback },
                    requestId
                )
            );
        }

        const existingUser = await User.findOne({ email }).select('+nin');
        if (existingUser) {
            logger.warn('User already exists', { requestId, email });
            return res.status(409).json(
                errorResponse('Email already registered', 409, null, requestId)
            );
        }

        if (nin) {
            const ninExists = await User.findOne({ nin }).select('+nin');
            if (ninExists) {
                logger.warn('NIN already registered', { requestId, email });
                return res.status(409).json(
                    errorResponse('NIN already registered', 409, null, requestId)
                );
            }
        }

        const user = new User({ email, password, nin });
        await user.save();

        // Ensure wallet creation with retry
        const wallet = await createWalletWithRetry(user, requestId);

        // Send welcome email asynchronously
        sendWelcomeEmail(user, requestId).catch(() => {
            // Log error but don't block response
            logger.error('Async welcome email failed', { userId: user._id, email: user.email, requestId });
        });

        logger.info('User registered successfully with wallet', {
            requestId,
            userId: user._id,
            email: user.email,
            walletId: wallet._id
        });

        res.status(201).json(
            successResponse('User registered successfully. Please complete KYC verification.', 201, {
                userId: user._id,
                email: user.email,
                walletId: wallet._id
            }, requestId)
        );
    } catch (error) {
        logger.error('Registration error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during registration: ${error.message}`, 500, null, requestId)
        );
    }
};

/**
 * Login user and generate tokens.
 */
export const login = async (req, res) => {
    const requestId = req.requestId;
    try {
        logger.debug('login: Input received', {
            requestId,
            body: req.body,
            sanitizedBody: req.sanitizedBody,
            validatedBody: req.validatedBody
        });

        if (!req.validatedBody) {
            logger.warn('Missing validated body in login request', {
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody
            });
            return res.status(400).json(
                errorResponse(
                    'Invalid request: No validated data provided',
                    400,
                    null,
                    requestId
                )
            );
        }

        const { email, password } = req.validatedBody;
        const deviceId = req.validatedBody.deviceId || req.sanitizedBody?.deviceId || uuidv4();
        const user = await User.findOne({ email }).select('+password +sessions');
        if (!user || !(await user.comparePassword(password))) {
            logger.warn('Invalid login attempt', { requestId, email });
            return res.status(401).json(
                errorResponse('Invalid email or password', 401, null, requestId)
            );
        }

        // Dynamic import for Wallet
        const { Wallet } = await import('../models/Wallet.js');
        const wallet = await Wallet.findOne({ userId: user._id }).select('userId');
        if (!wallet) {
            logger.warn('Wallet not found for user during login, attempting to create', {
                requestId,
                userId: user._id,
                email: user.email
            });
            await createWalletWithRetry(user, requestId);
        }

        const { accessToken, refreshToken } = generateTokens({
            id: user._id,
            email: user.email,
            role: user.role
        });

        user.sessions.push({
            refreshToken,
            deviceId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] || 'unknown',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });

        await user.cleanupSessions();
        user.lastLogin = new Date();
        await user.save();

        logger.info('User logged in successfully', {
            requestId,
            userId: user._id,
            email: user.email,
            deviceId,
            walletId: wallet?._id
        });

        res.status(200).json(
            successResponse('Login successful', 200, {
                accessToken,
                refreshToken,
                user: { id: user._id, email: user.email, role: user.role, isVerified: user.isVerified },
                walletId: wallet?._id
            }, requestId)
        );
    } catch (error) {
        logger.error('Login error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during login: ${error.message}`, 500, null, requestId)
        );
    }
};

/**
 * Refresh access token using refresh token.
 */
export const refreshToken = async (req, res) => {
    const requestId = req.requestId;
    try {
        logger.debug('refreshToken: Input received', {
            requestId,
            body: req.body,
            sanitizedBody: req.sanitizedBody,
            validatedBody: req.validatedBody
        });

        if (!req.validatedBody) {
            logger.warn('Missing validated body in refresh token request', {
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody
            });
            return res.status(400).json(
                errorResponse(
                    'Invalid request: No validated data provided',
                    400,
                    null,
                    requestId
                )
            );
        }

        const { refreshToken } = req.validatedBody;
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
        } catch (error) {
            logger.warn('Invalid or expired refresh token', { requestId, error: error.message });
            return res.status(401).json(
                errorResponse('Invalid or expired refresh token', 401, null, requestId)
            );
        }

        const user = await User.findById(decoded.userId).select('+sessions');
        if (!user) {
            logger.warn('User not found for refresh token', { requestId, userId: decoded.userId });
            return res.status(401).json(
                errorResponse('Unauthorized: User not found', 401, null, requestId)
            );
        }

        const session = user.sessions.find((s) => s.refreshToken === refreshToken);
        if (!session || session.expiresAt < new Date()) {
            logger.warn('Invalid or expired session for refresh', { requestId, userId: decoded.userId });
            return res.status(401).json(
                errorResponse('Unauthorized: Session expired or invalid', 401, null, requestId)
            );
        }

        // Dynamic import for Wallet
        const { Wallet } = await import('../models/Wallet.js');
        const wallet = await Wallet.findOne({ userId: user._id }).select('userId');
        if (!wallet) {
            logger.warn('Wallet not found for user during refresh, attempting to create', {
                requestId,
                userId: user._id,
                email: user.email
            });
            await createWalletWithRetry(user, requestId);
        }

        const { accessToken, refreshToken: newRefreshToken } = generateTokens({
            id: user._id,
            email: user.email,
            role: user.role
        });

        session.refreshToken = newRefreshToken;
        session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await user.save();

        logger.info('Token refreshed successfully', {
            requestId,
            userId: user._id,
            email: user.email
        });

        res.status(200).json(
            successResponse('Token refreshed successfully', 200, {
                accessToken,
                refreshToken: newRefreshToken
            }, requestId)
        );
    } catch (error) {
        logger.error('Token refresh error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during token refresh: ${error.message}`, 500, null, requestId)
        );
    }
};

/**
 * Get authenticated user profile.
 */
export const getProfile = async (req, res) => {
    const requestId = req.requestId;
    try {
        const user = await User.findById(req.user.id).select('email role isVerified lastLogin');
        if (!user) {
            logger.warn('User not found for profile', { requestId, userId: req.user.id });
            return res.status(404).json(
                errorResponse('User not found', 404, null, req.requestId)
            );
        }

        // Dynamic import for Wallet
        const { Wallet } = await import('../models/Wallet.js');
        const wallet = await Wallet.findOne({ userId: user._id }).select('userId');
        if (!wallet) {
            logger.warn('Wallet not found for user profile, attempting to create', {
                requestId,
                userId: user._id,
                email: user.email
            });
            await createWalletWithRetry(user, req.requestId);
        }

        logger.info('User profile retrieved', {
            requestId,
            userId: user._id,
            email: user.email,
            walletId: wallet?._id
        });

        res.status(200).json(
            successResponse('Profile retrieved successfully', 200, {
                user: {
                    id: user._id,
                    email: user.email,
                    role: user.role,
                    isVerified: user.isVerified,
                    lastLogin: user.lastLogin
                },
                walletId: wallet?._id
            }, req.requestId)
        );
    } catch (error) {
        logger.error('Profile retrieval error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during profile retrieval: ${error.message}`, 500, null, req.requestId)
        );
    }
};

/**
 * Logout from current session.
 */
export const logout = async (req, res) => {
    const requestId = req.requestId;
    try {
        const user = await User.findById(req.user.id).select('+sessions');
        if (!user) {
            logger.warn('User not found for logout', { requestId, userId: req.user.id });
            return res.status(404).json(
                errorResponse('User not found', 404, null, req.requestId)
            );
        }

        const { refreshToken } = req.body;
        if (!refreshToken) {
            logger.warn('No refresh token provided for logout', { requestId, userId: req.user.id });
            return res.status(400).json(
                errorResponse('No refresh token provided', 400, null, req.requestId)
            );
        }

        user.sessions = user.sessions.filter((s) => s.refreshToken !== refreshToken);
        await user.save();

        logger.info('User logged out successfully', {
            requestId,
            userId: user._id,
            email: user.email
        });

        res.status(200).json(
            successResponse('Logged out successfully', 200, null, req.requestId)
        );
    } catch (error) {
        logger.error('Logout error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during logout: ${error.message}`, 500, null, req.requestId)
        );
    }
};
/**
 * Logout from all sessions.
 */
export const logoutAll = async (req, res) => {
    const requestId = req.requestId;
    try {
        const user = await User.findById(req.user.id).select('+sessions');
        if (!user) {
            logger.warn('User not found for logout all', { requestId, userId: req.user.id });
            return res.status(404).json(
                errorResponse('User not found', 404, null, req.requestId)
            );
        }

        user.sessions = [];
        await user.save();

        logger.info('User logged out from all devices', {
            requestId,
            userId: user._id,
            email: user.email
        });

        res.status(200).json(
            successResponse('Logged out from all devices successfully', 200, null, req.requestId)
        );
    } catch (error) {
        logger.error('Logout all error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during logout all: ${error.message}`, 500, null, req.requestId)
        );
    }
};

/**
 * Request password reset.
 */
export const requestPasswordReset = async (req, res) => {
    const requestId = req.requestId;
    try {
        logger.debug('requestPasswordReset: Input received', {
            requestId,
            body: req.body,
            sanitizedBody: req.sanitizedBody,
            validatedBody: req.validatedBody
        });

        if (!req.validatedBody) {
            logger.warn('Missing validated body in password reset request', {
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody
            });
            return res.status(400).json(
                errorResponse(
                    'Invalid request: No validated data provided',
                    400,
                    null,
                    req.requestId
                )
            );
        }

        const { email } = req.validatedBody;
        const user = await User.findOne({ email }).select('+passwordResetToken +passwordResetExpires');
        if (!user) {
            logger.warn('Password reset requested for non-existent email', { requestId, email });
            return res.status(404).json(
                errorResponse('Email not found', 404, null, req.requestId)
            );
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = resetToken;
        user.passwordResetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await user.save();

        await sendPasswordResetEmail(user, resetToken, requestId);

        logger.info('Password reset requested', { requestId, userId: user._id, email });

        res.status(200).json(
            successResponse('Password reset email sent', 200, null, req.requestId)
        );
    } catch (error) {
        logger.error('Password reset request error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during password reset request: ${error.message}`, 500, null, req.requestId)
        );
    }
};

/**
 * Reset password using token.
 */
export const resetPassword = async (req, res) => {
    const requestId = req.requestId;
    try {
        logger.debug('resetPassword: Input received', {
            requestId,
            body: req.body,
            sanitizedBody: req.sanitizedBody,
            validatedBody: req.validatedBody
        });

        if (!req.validatedBody) {
            logger.warn('Missing validated body in password reset request', {
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody
            });
            return res.status(400).json(
                errorResponse(
                    'Invalid request: No validated data provided',
                    400,
                    null,
                    req.requestId
                )
            );
        }

        const { token, newPassword } = req.validatedBody;
        const passwordStrength = zxcvbn(newPassword);
        if (passwordStrength.score < 3) {
            logger.warn('Weak password attempt during reset', {
                requestId,
                score: passwordStrength.score
            });
            return res.status(400).json(
                errorResponse(
                    'Password is too weak. Use a stronger password with letters, numbers, and symbols.',
                    400,
                    { score: passwordStrength.score, feedback: passwordStrength.feedback },
                    req.requestId
                )
            );
        }

        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: new Date() }
        }).select('+passwordResetToken +passwordResetExpires +password');

        if (!user) {
            logger.warn('Invalid or expired password reset token', { requestId });
            return res.status(400).json(
                errorResponse('Invalid or expired password reset token', 400, null, req.requestId)
            );
        }

        user.password = newPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        logger.info('Password reset successfully', {
            requestId,
            userId: user._id,
            email: user.email
        });

        res.status(200).json(
            successResponse('Password reset successfully', 200, null, req.requestId)
        );
    } catch (error) {
        logger.error('Password reset error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during password reset: ${error.message}`, 500, null, req.requestId)
        );
    }
};

/**
 * Create wallet for existing user (admin only).
 */
export const createWalletForUser = async (req, res) => {
    const requestId = req.requestId;
    try {
        const { email } = req.validatedBody;
        const user = await User.findOne({ email });
        if (!user) {
            logger.warn('User not found for wallet creation', { requestId, email });
            return res.status(404).json(
                errorResponse('User not found', 404, null, requestId)
            );
        }

        const wallet = await createWalletWithRetry(user, requestId);

        logger.info('Wallet created for existing user', {
            requestId,
            userId: user._id,
            email: user.email,
            walletId: wallet._id
        });

        res.status(201).json(
            successResponse('Wallet created successfully for user', 201, {
                userId: user._id,
                email: user.email,
                walletId: wallet._id
            }, requestId)
        );
    } catch (error) {
        logger.error('Error creating wallet for existing user', {
            requestId,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json(
            errorResponse(`Internal server error during wallet creation: ${error.message}`, 500, null, requestId)
        );
    }
};

export default {
    register,
    login,
    refreshToken,
    getProfile,
    logout,
    logoutAll,
    requestPasswordReset,
    resetPassword,
    createWalletForUser
};