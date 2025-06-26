import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import Alert from '../components/Alert';

function Profile() {
    const { user } = useSelector((state) => state.auth);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const updatePasswordMutation = useMutation({
        mutationFn: (newPassword) => api.post('/api/auth/password-reset', { newPassword, email: user.email, token: 'mock-token' }),
        onSuccess: () => {
            setSuccess('Password updated successfully');
            setPassword('');
        },
        onError: (err) => {
            setError(err.response?.data?.message || 'Password update failed');
        },
    });

    const handleUpdatePassword = () => {
        updatePasswordMutation.mutate(password);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Profile</h1>
            <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="text-lg font-semibold">User Information</h2>
                <p>Email: {user.email}</p>
                <p>First Name: {user.firstName}</p>
                <p>Last Name: {user.lastName}</p>
                <p>KYC Status: {user.kycStatus}</p>
            </div>
            {error && <Alert type="error" message={error} onClose={() => setError('')} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}
            <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="text-lg font-semibold">Update Password</h2>
                <div className="space-y-4">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="p-2 w-full border rounded focus:ring focus:ring-primary"
                        placeholder="New Password"
                        aria-label="New password"
                    />
                    <button
                        onClick={handleUpdatePassword}
                        className="w-full bg-primary text-white p-2 rounded hover:bg-blue-700"
                        disabled={updatePasswordMutation.isLoading}
                    >
                        Update Password
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Profile;
