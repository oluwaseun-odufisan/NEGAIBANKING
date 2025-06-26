import React from 'react';

function Loading() {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-primary"></div>
        </div>
    );
}

export default Loading;
