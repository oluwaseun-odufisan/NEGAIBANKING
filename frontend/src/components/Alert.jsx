import React from 'react';

function Alert({ type = 'info', message, onClose }) {
    const alertStyles = {
        success: 'bg-success text-white',
        error: 'bg-danger text-white',
        warning: 'bg-warning text-black',
        info: 'bg-blue-500 text-white',
    };

    return (
        <div className={`p-4 rounded mb-4 flex justify-between items-center ${alertStyles[type]}`}>
            <span>{message}</span>
            {onClose && (
                <button onClick={onClose} className="text-white hover:text-gray-200">
                    &times;
                </button>
            )}
        </div>
    );
}

export default Alert;
