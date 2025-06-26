import React, { createContext, useState, useEffect } from 'react';
import { api } from '../services/api';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            api.get('/api/auth/me').then((res) => {
                setIsAuthenticated(true);
                setUser(res.data.data);
            }).catch(() => {
                localStorage.removeItem('accessToken');
            });
        }
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, setIsAuthenticated, setUser }}>
            {children}
        </AuthContext.Provider>
    );
}
