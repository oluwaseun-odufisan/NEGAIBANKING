import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import store from '../store/store';
import App from '../App';

const queryClient = new QueryClient();

test('renders login page', () => {
    render(
        <Provider store={store}>
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/login']}>
                    <App />
                </MemoryRouter>
            </QueryClientProvider>
        </Provider>
    );
    expect(screen.getByText(/Login/i)).toBeInTheDocument();
});

