// src/server.js
import { createServer } from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import logger from './utils/logger.js';

/**
 * Initializes the digital banking platform server with banking-grade reliability.
 * Connects to MongoDB and starts the HTTP server.
 * @returns {Promise<void>}
 */
const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Create HTTP server
        const server = createServer(app);

        // Start server with explicit host binding
        server.listen(env.PORT, '0.0.0.0', () => {
            logger.info(`API started on port ${env.PORT} in ${env.NODE_ENV} environment`, {
                baseUrl: env.BASE_URL
            });
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.syscall !== 'listen') {
                throw error;
            }
            const bind = typeof env.PORT === 'string' ? `Pipe ${env.PORT}` : `Port ${env.PORT}`;
            switch (error.code) {
                case 'EACCES':
                    logger.error(`${bind} requires elevated privileges`);
                    process.exit(1);
                case 'EADDRINUSE':
                    logger.error(`${bind} is already in use`);
                    process.exit(1);
                default:
                    throw error;
            }
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received. Closing server...');
            server.close(() => {
                logger.info('Server closed');
                process.exit(0);
            });
        });
    } catch (error) {
        logger.error('Failed to start server', { error: error.message, stack: error.stack });
        process.exit(1);
    }
};

startServer();