import React from 'react';
import { Link, useLocation } from 'react-router-dom';

function Sidebar({ isAdmin = false }) {
    const location = useLocation();

    const userLinks = [
        { name: 'Dashboard', path: '/dashboard' },
        { name: 'Wallet', path: '/wallet' },
        { name: 'Transactions', path: '/transactions' },
        { name: 'KYC', path: '/kyc' },
        { name: 'Profile', path: '/profile' },
    ];

    const adminLinks = [
        { name: 'Dashboard', path: '/admin' },
        { name: 'Users', path: '/admin/users' },
        { name: 'Transactions', path: '/admin/transactions' },
        { name: 'KYC', path: '/admin/kyc' },
        { name: 'Announcements', path: '/admin/announcements' },
    ];

    const links = isAdmin ? adminLinks : userLinks;

    return (
        <aside className="w-64 bg-white shadow-md p-4">
            <ul className="space-y-2">
                {links.map((link) => (
                    <li key={link.path}>
                        <Link
                            to={link.path}
                            className={`block p-2 rounded ${location.pathname === link.path ? 'bg-primary text-white' : 'hover:bg-gray-200'
                                }`}
                        >
                            {link.name}
                        </Link>
                    </li>
                ))}
            </ul>
        </aside>
    );
}

export default Sidebar;
