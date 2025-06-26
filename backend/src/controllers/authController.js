// src/controllers/authController.js
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import zxcvbn from 'zxcvbn';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { sendErrorAlert } from '../utils/email.js';

/**
 * Generates JWT access and refresh tokens.
 * @param {Object} user - User object with id, email, role
 * @returns {Object} Access and refresh tokens
 */
const generateTokens = (user) => {
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
        };

        await sendErrorAlert({ message: 'Welcome email sent' }, { ...mailOptions, requestId });
        logger.info('Welcome email sent', { userId: user._id, email: user.email, requestId });
    } catch (error) {
        logger.error('Failed to send welcome email', {
            userId: user._id,
            email: user.email,
            requestId,
            error: error.message,
            stack: error.stack,
        });
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
        };

        await sendErrorAlert({ message: 'Password reset email sent' }, { ...mailOptions, requestId });
        logger.info('Password reset email sent', { userId: user._id, email: user.email, requestId });
    } catch (error) {
        logger.error('Failed to send password reset email', {
            userId: user._id,
            email: user.email,
            requestId,
            error: error.message,
            stack: error.stack,
        });
    }
};

/**
 * Register a new user with strong password validation.
 */
export const register = async (req, res) => {
    const requestId = req.requestId;
    try {
        // Log input for debugging
        logger.debug('register: Input received', {
            requestId,
            body: req.body,
            sanitizedBody: req.sanitizedBody,
            validatedBody: req.validatedBody
        });

        // Check if validatedBody exists
        if (!req.validatedBody) {
            logger.warn('Missing validated body in registration request', {
                requestId,
                body: req.body,
                sanitizedBody: req.sanitizedBody,
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
                score: passwordStrength.score,
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

        await sendWelcomeEmail(user, requestId);

        logger.info('User registered successfully', {
            requestId,
            userId: user._id,
            email: user.email,
        });

        res.status(201).json(
            successResponse('User registered successfully. Please complete KYC verification.', 201, {
                userId: user._id,
                email: user.email,
            }, requestId)
        );
    } catch (error) {
        logger.error('Registration error', {
            requestId,
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json(
            errorResponse('Internal server error during registration', 500, null, requestId)
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
                sanitizedBody: req.sanitizedBody,
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

        const { accessToken, refreshToken } = generateTokens({
            id: user._id,
            email: user.email,
            role: user.role,
        });

        user.sessions.push({
            refreshToken,
            deviceId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] || 'unknown',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });

        await user.cleanupSessions();
        user.lastLogin = new Date();
        await user.save();

        logger.info('User logged in successfully', {
            requestId,
            userId: user._id,
            email: user.email,
            deviceId,
        });

        res.status(200).json(
            successResponse('Login successful', 200, {
                accessToken,
                refreshToken,
                user: { id: user._id, email: user.email, role: user.role, isVerified: user.isVerified },
            }, requestId)
        );
    } catch (error) {
        logger.error('Login error', {
            requestId,
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json(
            errorResponse('Internal server error during login', 500, null, requestId)
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
                sanitizedBody: req.sanitizedBody,
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

        const { accessToken, refreshToken: newRefreshToken } = generateTokens({
            id: user._id,
            email: user.email,
            role: user.role,
        });

        session.refreshToken = newRefreshToken;
        session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await user.save();

        logger.info('Token refreshed successfully', {
            requestId,
            userId: user._id,
            email: user.email,
        });

        res.status(200).json(
            successResponse('Token refreshed successfully', 200, {
                accessToken,
                refreshToken: newRefreshToken,
            }, requestId)
        );
    } catch (error) {
        logger.error('Token refresh error', {
            requestId,
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json(
            errorResponse('Internal server error during token refresh', 500, null, requestId)
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

        logger.info('User profile retrieved', {
            requestId,
            userId: user._id,
            email: user.email,
        });

        res.status(200).json(
            successResponse('Profile retrieved successfully', 200, {
                user: {
                    id: user._id,
                    email: user.email,
                    role: user.role,
                    isVerified: user.isVerified,
                    lastLogin: user.lastLogin,
                },
            }, requestId)
        );
    } catch (error) {
        logger.error('Profile retrieval error', {
            requestId,
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json(
            errorResponse('Internal server error during profile retrieval', 500, null, req.requestId)
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

        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];
        if (!token) {
            logger.warn('No token provided for logout', { requestId, userId: req.user.id });
            return res.status(400).json(
                errorResponse('No token provided', 400, null, req.requestId)
            );
        }

        user.sessions = user.sessions.filter((s) => s.refreshToken !== token);
        await user.save();

        logger.info('User logged out successfully', {
            requestId,
            userId: user._id,
            email: user.email,
        });

        res.status(200).json(
            successResponse('Logged out successfully', 200, null, req.requestId)
        );
    } catch (error) {
        logger.error('Logout error', {
            requestId,
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json(
            errorResponse('Internal server error during logout', 500, null, req.requestId)
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
            email: user.email,
        });

        res.status(200).json(
            successResponse('Logged out from all devices successfully', 200, null, req.requestId)
        );
    } catch (error) {
        logger.error('Logout all error', {
            requestId,
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json(
            errorResponse('Internal server error during logout all', 500, null, req.requestId)
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
                sanitizedBody: req.sanitizedBody,
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
            stack: error.stack,
        });
        res.status(500).json(
            errorResponse('Internal server error during password reset request', 500, null, req.requestId)
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
                sanitizedBody: req.sanitizedBody,
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
                score: passwordStrength.score,
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
            passwordResetExpires: { $gt: new Date() },
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
            email: user.email,
        });

        res.status(200).json(
            successResponse('Password reset successfully', 200, null, req.requestId)
        );
    } catch (error) {
        logger.error('Password reset error', {
            requestId,
            error: error.message,
            stack: error.stack,
        });
        res.status(500).json(
            errorResponse('Internal server error during password reset', 500, null, req.requestId)
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
};