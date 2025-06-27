// src/config/env.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Failed to load .env file:', result.error.message);
    process.exit(1);
}

/**
 * List of required environment variables for the digital banking platform.
 */
const requiredEnvVars = [
    'PORT',
    'MONGODB_URI',
    'REDIS_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ENCRYPTION_KEY',
    'ENCRYPTION_IV',
    'FLUTTERWAVE_SECRET_KEY',
    'FLUTTERWAVE_PUBLIC_KEY',
    'EMAIL_SERVICE',
    'EMAIL_USER',
    'EMAIL_PASS',
    'NODE_ENV',
    'BASE_URL',
    'FRONTEND_URL'
];

/**
 * List of optional environment variables.
 */
const optionalEnvVars = [
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'NIMC_API_KEY',
    'YOUVERIFY_API_KEY',
    'SMILE_IDENTITY_API_KEY'
];

/**
 * Check for missing required environment variables and exit if any are absent.
 */
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(
        'Missing required environment variables:',
        missingEnvVars.join(', ')
    );
    process.exit(1);
}

/**
 * Validate specific environment variables for correct format or length.
 */
if (process.env.JWT_SECRET.length < 64) {
    console.error('JWT_SECRET must be at least 64 characters long');
    process.exit(1);
}
if (process.env.JWT_REFRESH_SECRET.length < 64) {
    console.error('JWT_REFRESH_SECRET must be at least 64 characters long');
    process.exit(1);
}
if (process.env.ENCRYPTION_KEY.length !== 32) {
    console.error('ENCRYPTION_KEY must be exactly 32 bytes');
    process.exit(1);
}
if (process.env.ENCRYPTION_IV.length !== 16) {
    console.error('ENCRYPTION_IV must be exactly 16 bytes');
    process.exit(1);
}
if (!['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
    console.error('NODE_ENV must be one of: development, production, test');
    process.exit(1);
}

/**
 * Configuration object for environment variables.
 * @type {Object}
 */
export const env = {
    PORT: parseInt(process.env.PORT, 10) || 3000,
    NODE_ENV: process.env.NODE_ENV,
    BASE_URL: process.env.BASE_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
    MONGODB_URI: process.env.MONGODB_URI,
    REDIS_URL: process.env.REDIS_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ENCRYPTION_IV: process.env.ENCRYPTION_IV,
    FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
    FLUTTERWAVE_PUBLIC_KEY: process.env.FLUTTERWAVE_PUBLIC_KEY,
    NIMC_API_KEY: process.env.NIMC_API_KEY || '',
    YOUVERIFY_API_KEY: process.env.YOUVERIFY_API_KEY || '',
    SMILE_IDENTITY_API_KEY: process.env.SMILE_IDENTITY_API_KEY || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_SECRET: process.env.CLOUDINARY_SECRET || '',
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    EMAIL_SERVICE: process.env.EMAIL_SERVICE,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS
};