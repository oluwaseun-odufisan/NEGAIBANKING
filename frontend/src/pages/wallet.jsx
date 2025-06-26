import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Alert from '../components/Alert';

function Wallet() {
    const [amount, setAmount] = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [error, setError] = useState('');
    const queryClient = useQueryClient();

    const { data: balance, isLoading } = useQuery({
        queryKey: ['balance'],
        queryFn: () => api.get('/api/wallet/balance').then((res) => res.data.data),
    });

    const fundMutation = useMutation({
        mutationFn: (amount) => api.post('/api/wallet/fund', { amount: parseFloat(amount) }),
        onSuccess: () => {
            queryClient.invalidateQueries(['balance']);
        },
        onError: (err) => {
            setError(err.response?.data?.message || 'Funding failed');
        },
    });

    const transferMutation = useMutation({
        mutationFn: (data) => api.post('/api/wallet/transfer', data),
        onSuccess: () => {
            queryClient.invalidateQueries(['balance']);
            setAmount('');
            setRecipientEmail('');
        },
        onError: (err) => {
            setError(err.response?.data?.message || 'Transfer failed');
        },
    });

    const handleFund = () => {
        fundMutation.mutate(amount);
    };

    const handleTransfer = () => {
        transferMutation.mutate({ recipientEmail, amount: parseFloat(amount) });
    };

    if (isLoading) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Wallet</h1>
            <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="text-lg font-semibold">Balance: {balance?.balance || 0} NGN</h2>
            </div>
            {error && <Alert type="error" message={error} onClose={() => setError('')} />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-lg font-semibold">Fund Wallet</h2>
                    <div className="space-y-4">
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="p-2 w-full border rounded focus:ring focus:ring-primary"
                            placeholder="Amount (NGN)"
                            aria-label="Fund amount"
                        />
                        <button
                            onClick={handleFund}
                            className="w-full bg-primary text-white p-2 rounded hover:bg-blue-700"
                            disabled={fundMutation.isLoading}
                        >
                            Fund
                        </button>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-lg font-semibold">Transfer Funds</h2>
                    <div className="space-y-4">
                        <input
                            type="email"
                            value={recipientEmail}
                            onChange={(e) => setRecipientEmail(e.target.value)}
                            className="p-2 w-full border rounded focus:ring focus:ring-primary"
                            placeholder="Recipient Email"
                            aria-label="Recipient email"
                        />
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="p-2 w-full border rounded focus:ring focus:ring-primary"
                            placeholder="Amount (NGN)"
                            aria-label="Transfer amount"
                        />
                        <button
                            onClick={handleTransfer}
                            className="w-full bg-primary text-white p-2 rounded hover:bg-blue-700"
                            disabled={transferMutation.isLoading}
                        >
                            Transfer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Wallet;
