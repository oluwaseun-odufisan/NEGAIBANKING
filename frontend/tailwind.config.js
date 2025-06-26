/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{js,jsx}'],
    theme: {
        extend: {
            colors: {
                primary: '#1a73e8',
                secondary: '#34d399',
                danger: '#ef4444',
                success: '#10b981',
                warning: '#f59e0b',
            },
        },
    },
    plugins: [],
};
