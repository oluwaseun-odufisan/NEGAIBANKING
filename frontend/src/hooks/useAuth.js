import { useSelector, useDispatch } from 'react-redux';
import { login, logout } from '../store/slices/authSlice';
import { api } from '../services/api';

export const useAuth = () => {
    const { isAuthenticated, user, accessToken } = useSelector((state) => state.auth);
    const dispatch = useDispatch();

    const signIn = async (email, password) => {
        const response = await api.post('/api/auth/login', { email, password });
        dispatch(login({ user: response.data.data.user, accessToken: response.data.data.accessToken }));
    };

    const signOut = () => {
        dispatch(logout());
    };

    return { isAuthenticated, user, accessToken, signIn, signOut };
};

