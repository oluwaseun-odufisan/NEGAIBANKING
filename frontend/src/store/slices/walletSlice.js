import { createSlice } from '@reduxjs/toolkit';

const walletSlice = createSlice({
    name: 'wallet',
    initialState: {
        balance: 0,
    },
    reducers: {
        setBalance: (state, action) => {
            state.balance = action.payload;
        },
    },
});

export const { setBalance } = walletSlice.actions;
export default walletSlice.reducer;
