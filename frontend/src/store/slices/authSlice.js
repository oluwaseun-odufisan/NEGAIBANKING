import { createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
    name: 'auth',
    initialState: {
        isAuthenticated: false,
        user: null,
        accessToken: null,
        message: null,
    },
    reducers: {
        login: (state, action) => {
            state.isAuthenticated = true;
            state.user = action.payload.user;
            state.accessToken = action.payload.accessToken;
            localStorage.setItem('accessToken', action.payload.accessToken);
        },
        logout: (state) => {
            state.isAuthenticated = false;
            state.user = null;
            state.accessToken = null;
            localStorage.removeItem('accessToken');
        },
        setMessage: (state, action) => {
            state.message = action.payload;
        },
        clearMessage: (state) => {
            state.message = null;
        },
    },
});

export const { login, logout, setMessage, clearMessage } = authSlice.actions;
export default authSlice.reducer;
