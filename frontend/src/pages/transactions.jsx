import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

function Transactions() {
    const { data: transactions, isLoading } = useQuery({
        queryKey: ['transactions'],
        queryFn: () => api.get('/api/transactions/user').then((res) => res.data.data),
    });

    if (isLoading) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Transactions</h1>
            <div className="bg-white p-4 rounded-lg shadow">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-200">
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Type</th>
                            <th className="p-2 text-left">Amount (NGN)</th>
                            <th className="p-2 text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions?.map((tx) => (
                            <tr key={tx._id} className="border-b">
                                <td className="p-2">{new Date(tx.createdAt).toLocaleDateString()}</td>
                                <td className="p-2">{tx.type}</td>
                                <td className="p-2">{tx.amount}</td>
                                <td className="p-2">{tx.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Transactions;
