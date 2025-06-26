// src/config/env.js
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * List of required environment variables for the digital banking platform.
 * Ensures all critical configurations are present to prevent runtime errors.
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
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'EMAIL_SERVICE',
    'EMAIL_USER',
    'EMAIL_PASS',
    'NODE_ENV',
    'BASE_URL',
    'FRONTEND_URL'
];

/**
 * Check for missing environment variables and exit if any are absent.
 * Logs missing variables for debugging.
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
 * Ensures security and compatibility for banking-grade requirements.
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
 * Provides type coercion and defaults where applicable.
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
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_SECRET: process.env.CLOUDINARY_SECRET,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    EMAIL_SERVICE: process.env.EMAIL_SERVICE,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
};