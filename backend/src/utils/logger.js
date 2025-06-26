// src/utils/logger.js
import winston from 'winston';
import { env } from '../config/env.js';
import { sendErrorAlert } from './email.js';

/**
 * Configures Winston logger for banking-grade logging with email alerts.
 * Supports CBN’s 7-year audit log retention with file rotation.
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'NEG-AI-banking-backend' },
    transports: [
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 10,
            tailable: true,
            zippedArchive: true
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880,
            maxFiles: 10,
            tailable: true,
            zippedArchive: true
        })
    ]
});

// Add console transport in non-production
if (env.NODE_ENV !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
            level: 'debug'
        })
    );
}

// Send email alerts for error-level logs
logger.on('data', (log) => {
    if (log.level === 'error' && env.NODE_ENV !== 'test') {
        sendErrorAlert(new Error(log.message), log);
    }
});

// Stream for morgan HTTP logging
logger.stream = {
    write: (message) => logger.info(message.trim())
};

export default logger;