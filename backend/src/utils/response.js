// src/utils/response.js
/**
 * Formats a successful API response.
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code (e.g., 200, 201)
 * @param {Object} [data] - Response data
 * @param {string} [requestId] - Request ID for traceability
 * @returns {Object} Formatted response
 */
export const successResponse = (
    message,
    statusCode = 200,
    data = null,
    requestId = 'N/A'
) => ({
    status: 'success',
    message,
    data,
    requestId,
    timestamp: new Date().toISOString()
});

/**
 * Formats an error API response.
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (e.g., 400, 500)
 * @param {Object} [details] - Error details (e.g., stack trace, validation errors)
 * @param {string} [requestId] - Request ID for traceability
 * @returns {Object} Formatted response
 */
export const errorResponse = (
    message,
    statusCode = 500,
    details = null,
    requestId = 'N/A'
) => ({
    status: 'error',
    message,
    details,
    requestId,
    timestamp: new Date().toISOString()
});