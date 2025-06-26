// src/config/db.js
import mongoose from 'mongoose';
import { env } from './env.js';
import logger from '../utils/logger.js';

/**
 * Connects to MongoDB with retry logic for banking-grade reliability.
 * Initializes collections and indexes for performance and auditability.
 * @returns {Promise<void>}
 */
export const connectDB = async () => {
    let retries = 5;
    const retryDelay = 5000; // 5 seconds

    while (retries) {
        try {
            // Connect to MongoDB with secure options
            await mongoose.connect(env.MONGODB_URI, {
                serverSelectionTimeoutMS: 5000,
                maxPoolSize: 10, // Connection pool for scalability
                socketTimeoutMS: 45000, // Prevent hanging connections
                family: 4 // Prefer IPv4 for compatibility
            });

            logger.info('MongoDB connected successfully', { service: 'NEG-AI-banking-backend' });
            break;
        } catch (error) {
            logger.error(`MongoDB connection error (attempt ${6 - retries})`, {
                error: error.message,
                stack: error.stack
            });
            retries -= 1;
            if (retries === 0) {
                logger.error('Max retries reached. Exiting process...', {
                    service: 'NEG-AI-banking-backend'
                });
                process.exit(1);
            }
            logger.info(`Retrying connection in ${retryDelay / 1000} seconds...`, {
                service: 'NEG-AI-banking-backend'
            });
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }

    // Initialize collections and indexes on successful connection
    mongoose.connection.on('connected', async () => {
        try {
            const db = mongoose.connection.db;
            // Ensure core collections exist
            await db.createCollection('wallets');
            await db.createCollection('transactions');
            await db.createCollection('kycs');
            await db.createCollection('notifications');
            await db.createCollection('auditlogs');

            // Create indexes for performance and compliance
            await db.collection('wallets').createIndex({ userId: 1 }, { unique: true });
            await db.collection('transactions').createIndex({ userId: 1, createdAt: -1 });
            await db.collection('kycs').createIndex({ userId: 1 }, { unique: true });
            await db.collection('notifications').createIndex({ userId: 1, createdAt: -1 });
            await db.collection('auditlogs').createIndex({ action: 1, createdAt: -1 });

            logger.info('MongoDB collections and indexes initialized successfully', {
                service: 'NEG-AI-banking-backend'
            });
        } catch (error) {
            logger.error('Error initializing collections', {
                error: error.message,
                stack: error.stack,
                service: 'NEG-AI-banking-backend'
            });
        }
    });

    // Handle connection errors
    mongoose.connection.on('error', error => {
        logger.error('MongoDB connection error', {
            error: error.message,
            stack: error.stack,
            service: 'NEG-AI-banking-backend'
        });
    });

    // Handle disconnection
    mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Attempting to reconnect...', {
            service: 'NEG-AI-banking-backend'
        });
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed due to app termination', {
            service: 'NEG-AI-banking-backend'
        });
        process.exit(0);
    });
};