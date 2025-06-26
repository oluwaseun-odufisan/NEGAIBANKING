// src/utils/email.js
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import logger from './logger.js';

/**
 * Configures Nodemailer transport for sending error alerts.
 * @returns {nodemailer.Transporter} Configured transporter
 */
const transporter = nodemailer.createTransport({
    service: env.EMAIL_SERVICE,
    auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASS
    }
});

/**
 * Sends an email alert for critical errors.
 * @param {Error} error - The error object
 * @param {Object} context - Additional context (e.g., request data)
 * @returns {Promise<void>}
 */
export const sendErrorAlert = async (error, context = {}) => {
    try {
        const mailOptions = {
            from: env.EMAIL_USER,
            to: env.EMAIL_USER, // Replace with admin email in production
            subject: `Critical Error in NEG AI Banking Platform [${env.NODE_ENV}]`,
            text: `
        Error: ${error.message}
        Stack: ${error.stack}
        Context: ${JSON.stringify(context, null, 2)}
        Timestamp: ${new Date().toISOString()}
        Environment: ${env.NODE_ENV}
        `
        };

        await transporter.sendMail(mailOptions);
        logger.info('Error alert email sent successfully', { error: error.message });
    } catch (err) {
        logger.error('Failed to send error alert email', {
            error: err.message,
            originalError: error.message
        });
    }
};