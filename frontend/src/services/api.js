import axios from 'axios';
import { store } from '../store/store';
import { logout } from '../store/slices/authSlice';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const { accessToken } = store.getState().auth;
    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            store.dispatch(logout());
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export { api };
