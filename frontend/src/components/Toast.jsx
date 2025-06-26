import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { clearMessage } from '../store/slices/authSlice';

function Toast() {
    const { message } = useSelector((state) => state.auth);
    const dispatch = useDispatch();

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => {
                dispatch(clearMessage());
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [message, dispatch]);

    if (!message) return null;

    return (
        <div className="fixed bottom-4 right-4 bg-success text-white p-4 rounded shadow-lg">
            {message}
        </div>
    );
}

export default Toast;
