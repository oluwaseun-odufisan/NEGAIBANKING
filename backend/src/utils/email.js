import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import logger from './logger.js';

/**
 * Initializes nodemailer transporter for sending emails.
 */
const transporter = nodemailer.createTransport({
    service: env.EMAIL_SERVICE,
    auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASS
    },
    pool: true, // Use connection pooling to reduce login attempts
    maxConnections: 5,
    maxMessages: 10
});

/**
 * Sends an email with error alerting capabilities.
 * @param {Object} logData - Error details for logging
 * @param {Object} mailOptions - Nodemailer mail options
 * @param {string} mailOptions.requestId - Request ID for tracking
 */
export const sendErrorAlert = async (logData, mailOptions) => {
    try {
        if (!env.EMAIL_USER || !env.EMAIL_PASS || !env.EMAIL_SERVICE) {
            logger.warn('Email configuration is incomplete', {
                requestId: mailOptions.requestId,
                ...logData
            });
            return;
        }

        if (!mailOptions.to) {
            logger.warn('No recipients defined for email', {
                requestId: mailOptions.requestId,
                ...logData
            });
            return;
        }

        await transporter.sendMail({
            ...mailOptions,
            from: `"NEG AI Banking Platform" <${env.EMAIL_USER}>`
        });

        logger.info('Email sent successfully', {
            requestId: mailOptions.requestId,
            to: mailOptions.to,
            subject: mailOptions.subject,
            ...logData
        });
    } catch (error) {
        logger.error('Failed to send email', {
            requestId: mailOptions.requestId,
            to: mailOptions.to || 'unknown',
            subject: mailOptions.subject || 'unknown',
            error: error.message,
            stack: error.stack,
            ...logData
        });
    }
};