import React from 'react';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function Dashboard() {
    const { user } = useSelector((state) => state.auth);

    const { data: balance } = useQuery({
        queryKey: ['balance'],
        queryFn: () => api.get('/api/wallet/balance').then((res) => res.data.data),
    });

    const { data: transactions } = useQuery({
        queryKey: ['transactions'],
        queryFn: () => api.get('/api/transactions/user').then((res) => res.data.data),
    });

    const chartData = {
        labels: transactions?.map((tx) => new Date(tx.createdAt).toLocaleDateString()) || [],
        datasets: [
            {
                label: 'Transaction Amount',
                data: transactions?.map((tx) => tx.amount) || [],
                borderColor: '#1a73e8',
                fill: false,
            },
        ],
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Welcome, {user?.firstName}</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-lg font-semibold">Wallet Balance</h2>
                    <p className="text-2xl">{balance?.balance || 0} NGN</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-lg font-semibold">Recent Transactions</h2>
                    <Line data={chartData} />
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
