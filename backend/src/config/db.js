// src/config/db.js
import mongoose from 'mongoose';
import { env } from './env.js';

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

            console.log('MongoDB connected successfully');
            break;
        } catch (error) {
            console.error(`MongoDB connection error (attempt ${6 - retries}):`, error.message);
            retries -= 1;
            if (retries === 0) {
                console.error('Max retries reached. Exiting process...');
                process.exit(1);
            }
            console.log(`Retrying connection in ${retryDelay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }

    // Initialize collections and indexes on successful connection
    mongoose.connection.on('connected', async () => {
        try {
            const db = mongoose.connection.db;
            // Ensure core collections exist
            await db.createCollection('users');
            await db.createCollection('wallets');
            await db.createCollection('transactions');
            await db.createCollection('kycs');
            await db.createCollection('notifications');
            await db.createCollection('auditlogs');

            // Create indexes for performance and compliance
            await db.collection('users').createIndex({ email: 1 }, { unique: true });
            await db.collection('wallets').createIndex({ userId: 1 }, { unique: true });
            await db.collection('transactions').createIndex({ userId: 1, createdAt: -1 });
            await db.collection('kycs').createIndex({ userId: 1 }, { unique: true });
            await db.collection('notifications').createIndex({ userId: 1, createdAt: -1 });
            await db.collection('auditlogs').createIndex({ action: 1, createdAt: -1 });

            console.log('MongoDB collections and indexes initialized successfully');
        } catch (error) {
            console.error('Error initializing collections:', error.message);
        }
    });

    // Handle connection errors
    mongoose.connection.on('error', error => {
        console.error('MongoDB connection error:', error.message);
    });

    // Handle disconnection
    mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('MongoDB connection closed due to app termination');
        process.exit(0);
    });
};