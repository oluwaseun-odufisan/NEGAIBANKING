// src/app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import corsMiddleware from './middlewares/corsMiddleware.js';
import requestIdMiddleware from './middlewares/requestId.js';
import securityMiddleware from './middlewares/securityMiddleware.js';
import morgan from 'morgan';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import errorHandler from './middlewares/errorHandler.js';
import notFound from './middlewares/notFound.js';
import { successResponse } from './utils/response.js';

// Get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initializes the Express application with banking-grade middleware for security, logging, and request handling.
 * Ensures compliance with CBN/NDPC regulations and maintains favicon functionality.
 * @returns {express.Application} Configured Express app
 */
const app = express();

// Serve static files (e.g., favicon.ico)
app.use(express.static(path.join(__dirname, '../public')));

// Request ID middleware (first to assign requestId)
app.use(requestIdMiddleware);

// CORS middleware with preflight logging
app.use(corsMiddleware.preflightLogger);
app.use(corsMiddleware());

// HTTP request logging for auditing
app.use(
    morgan('combined', {
        stream: {
            write: (message) => logger.info(message.trim())
        }
    })
);

// Security middleware (helmet, rate-limiting, sanitization)
app.use(securityMiddleware);

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Favicon endpoint to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'favicon.ico'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json(
        successResponse(
            'NEG AI Banking Platform API is healthy',
            200,
            {
                uptime: process.uptime(),
                environment: env.NODE_ENV
            },
            req.requestId
        )
    );
});

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json(
        successResponse(
            'Welcome to the NEG AI Banking Platform API',
            200,
            { version: '1.0.0' },
            req.requestId
        )
    );
});

// import validateRequest from './middlewares/validateRequest.js';
// import { z } from 'zod';
// // Test validation endpoint
// app.post(
//     '/test-validation',
//     validateRequest({
//         body: z.object({
//             name: z.string().min(3, 'Name must be at least 3 characters long'),
//             email: z.string().email('Invalid email format')
//         })
//     }),
//     (req, res) => {
//         res.status(200).json(
//             successResponse(
//                 'Valid data received',
//                 200,
//                 req.validatedBody || {}, // Use validatedBody
//                 req.requestId
//             )
//         );
//     }
// );

// app.get('/test-error', (req, res) => {
//     throw new Error('Test error');
// });

// app.post('/test-sanitization', (req, res) => {
//     res.status(200).json(
//         successResponse('Sanitized data', 200, {
//             body: req.sanitizedBody,
//             query: req.sanitizedQuery,
//             params: req.sanitizedParams
//         }, req.requestId)
//     );
// });

// Not found middleware
app.use(notFound);

// Global error handler
app.use(errorHandler);

export default app;




