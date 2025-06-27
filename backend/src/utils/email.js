// src/utils/email.js
import nodemailer from 'nodemailer';
import logger from './logger.js';
import { env } from '../config/env.js';

/**
 * Initializes nodemailer transporter for sending emails.
 */
const transporter = nodemailer.createTransport({
    service: env.EMAIL_SERVICE,
    auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASS
    }
});

/**
 * Sends an email with error alerting capabilities.
 * @param {Object} errorDetails - Error details for logging
 * @param {Object} mailOptions - Nodemailer mail options
 * @param {string} mailOptions.requestId - Request ID for tracking
 */
export const sendErrorAlert = async (errorDetails, mailOptions) => {
    try {
        if (!env.EMAIL_USER || !env.EMAIL_PASS || !env.EMAIL_SERVICE) {
            throw new Error('Email configuration is incomplete');
        }

        await transporter.sendMail({
            ...mailOptions,
            from: `"NEG AI Banking Platform" <${env.EMAIL_USER}>`
        });

        logger.info('Email sent successfully', {
            requestId: mailOptions.requestId,
            to: mailOptions.to,
            subject: mailOptions.subject
        });
    } catch (error) {
        logger.error('Failed to send email', {
            requestId: mailOptions.requestId,
            error: error.message,
            stack: error.stack,
            to: mailOptions.to,
            subject: mailOptions.subject
        });
        throw error; // Propagate error to caller
    }
};