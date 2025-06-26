import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/login';
import Signup from './pages/signup';
import Dashboard from './pages/dashboard';
import Wallet from './pages/wallet';
import Transactions from './pages/transactions';
import Profile from './pages/profile';
import Kyc from './pages/kyc';
import Error from './pages/error';
import AdminDashboard from './pages/admin/index';
import AdminUsers from './pages/admin/users';
import AdminTransactions from './pages/admin/transactions';
import AdminKyc from './pages/admin/kyc';
import AdminAnnouncements from './pages/admin/announcements';

function ProtectedRoute({ children, isAdmin = false }) {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (isAdmin && user?.role !== 'admin') return <Navigate to="/error" />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/wallet"
          element={
            <ProtectedRoute>
              <Wallet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transactions"
          element={
            <ProtectedRoute>
              <Transactions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kyc"
          element={
            <ProtectedRoute>
              <Kyc />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route element={<AdminLayout />}>
        <Route
          path="/admin"
          element={
            <ProtectedRoute isAdmin>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute isAdmin>
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/transactions"
          element={
            <ProtectedRoute isAdmin>
              <AdminTransactions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/kyc"
          element={
            <ProtectedRoute isAdmin>
              <AdminKyc />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/announcements"
          element={
            <ProtectedRoute isAdmin>
              <AdminAnnouncements />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="/error" element={<Error />} />
      <Route path="*" element={<Navigate to="/error" />} />
    </Routes>
  );
}

export default App;
