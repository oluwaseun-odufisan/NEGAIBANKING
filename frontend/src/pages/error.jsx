import React from 'react';
import { Link } from 'react-router-dom';

function Error() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-danger">404 - Page Not Found</h1>
                <p className="mt-4">The page you're looking for doesn't exist.</p>
                <Link to="/" className="mt-4 inline-block bg-primary text-white p-2 rounded hover:bg-blue-700">
                    Go to Home
                </Link>
            </div>
        </div>
    );
}

export default Error;
