import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { login } from '../store/slices/authSlice';
import { api } from '../services/api';
import Alert from '../components/Alert';

function Signup() {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await api.post('/api/auth/register', formData);
            dispatch(login({ user: response.data.data, accessToken: response.data.data.accessToken }));
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'Signup failed');
        }
    };

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold text-center">Sign Up</h1>
            {error && <Alert type="error" message={error} onClose={() => setError('')} />}
            <div className="space-y-4">
                <div>
                    <label htmlFor="firstName" className="block text-sm font-medium">
                        First Name
                    </label>
                    <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={handleChange}
                        className="mt-1 p-2 w-full border rounded focus:ring focus:ring-primary"
                        required
                        aria-label="First name"
                    />
                </div>
                <div>
                    <label htmlFor="lastName" className="block text-sm font-medium">
                        Last Name
                    </label>
                    <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        value={formData.lastName}
                        onChange={handleChange}
                        className="mt-1 p-2 w-full border rounded focus:ring focus:ring-primary"
                        required
                        aria-label="Last name"
                    />
                </div>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium">
                        Email
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="mt-1 p-2 w-full border rounded focus:ring focus:ring-primary"
                        required
                        aria-label="Email address"
                    />
                </div>
                <div>
                    <label htmlFor="password" className="block text-sm font-medium">
                        Password
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="mt-1 p-2 w-full border rounded focus:ring focus:ring-primary"
                        required
                        aria-label="Password"
                    />
                </div>
                <button
                    type="submit"
                    onClick={handleSubmit}
                    className="w-full bg-primary text-white p-2 rounded hover:bg-blue-700"
                >
                    Sign Up
                </button>
            </div>
        </div>
    );
}

export default Signup;
