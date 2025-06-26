import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { login } from '../store/slices/authSlice';
import { api } from '../services/api';
import Alert from '../components/Alert';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await api.post('/api/auth/login', { email, password });
            dispatch(login({ user: response.data.data.user, accessToken: response.data.data.accessToken }));
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed');
        }
    };

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold text-center">Login</h1>
            {error && <Alert type="error" message={error} onClose={() => setError('')} />}
            <div className="space-y-4">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium">
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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
                    Login
                </button>
            </div>
        </div>
    );
}

export default Login;
