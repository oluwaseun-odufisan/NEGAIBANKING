import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store/slices/authSlice';

function Navbar({ isAdmin = false }) {
    const { user } = useSelector((state) => state.auth);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login');
    };

    return (
        <nav className="bg-primary text-white p-4 shadow-md">
            <div className="container mx-auto flex justify-between items-center">
                <Link to={isAdmin ? '/admin' : '/dashboard'} className="text-xl font-bold">
                    Digital Bank
                </Link>
                <div className="flex items-center space-x-4">
                    {user && (
                        <>
                            <span className="hidden md:block">Welcome, {user.firstName}</span>
                            <Link to="/profile" className="hover:underline">
                                Profile
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="bg-danger text-white px-4 py-2 rounded hover:bg-red-700"
                            >
                                Logout
                            </button>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}

export default Navbar;
