import React from 'react';
import { Outlet } from 'react-router-dom';

function AuthLayout() {
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
                <Outlet />
            </div>
        </div>
    );
}

export default AuthLayout;
