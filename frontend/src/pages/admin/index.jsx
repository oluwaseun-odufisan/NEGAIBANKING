import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function AdminDashboard() {
    const { data: stats } = useQuery({
        queryKey: ['adminStats'],
        queryFn: () => api.get('/api/admin/dashboard').then((res) => res.data.data),
    });

    const chartData = {
        labels: ['Users', 'Transactions', 'Pending KYC'],
        datasets: [
            {
                label: 'Count',
                data: [
                    stats?.totalUsers || 0,
                    stats?.totalTransactions || 0,
                    stats?.pendingKyc || 0,
                ],
                backgroundColor: '#1a73e8',
            },
        ],
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-lg font-semibold">Total Users</h2>
                    <p className="text-2xl">{stats?.totalUsers || 0}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-lg font-semibold">Total Transactions</h2>
                    <p className="text-2xl">{stats?.totalTransactions || 0}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-lg font-semibold">Pending KYC</h2>
                    <p className="text-2xl">{stats?.pendingKyc || 0}</p>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="text-lg font-semibold">Analytics</h2>
                <Bar data={chartData} />
            </div>
        </div>
    );
}

export default AdminDashboard;
