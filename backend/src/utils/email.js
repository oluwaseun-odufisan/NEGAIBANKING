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
 * Sends an email with error or transaction alerting capabilities.
 * @param {Object} logData - Details for logging (includes type: 'transaction' or 'error')
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

        const emailType = logData.type || 'unknown';
        await transporter.sendMail({
            ...mailOptions,
            from: `"NEG AI Banking Platform" <${env.EMAIL_USER}>` // Always use EMAIL_USER as sender
        });

        logger.info(`${emailType.charAt(0).toUpperCase() + emailType.slice(1)} email sent successfully`, {
            requestId: mailOptions.requestId,
            to: mailOptions.to,
            subject: mailOptions.subject,
            type: emailType,
            ...logData
        });
    } catch (error) {
        logger.error(`Failed to send ${logData.type || 'unknown'} email`, {
            requestId: mailOptions.requestId,
            to: mailOptions.to || 'unknown',
            subject: mailOptions.subject || 'unknown',
            error: error.message,
            stack: error.stack,
            type: logData.type || 'unknown',
            ...logData
        });
    }
};