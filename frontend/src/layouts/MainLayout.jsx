import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import Toast from '../components/Toast';

function MainLayout() {
    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col">
                <Navbar />
                <main className="p-6 bg-gray-100 flex-1">
                    <Outlet />
                </main>
                <Toast />
            </div>
        </div>
    );
}

export default MainLayout;