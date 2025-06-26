import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import walletReducer from './slices/walletSlice';

const store = configureStore({
    reducer: {
        auth: authReducer,
        wallet: walletReducer,
    },
});

export default store;