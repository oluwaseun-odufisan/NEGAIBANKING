import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../services/api';

export const useFetch = (key, endpoint) => {
    return useQuery({
        queryKey: [key],
        queryFn: () => api.get(endpoint).then((res) => res.data.data),
    });
};

export const useMutate = (endpoint, onSuccess) => {
    return useMutation({
        mutationFn: (data) => api.post(endpoint, data),
        onSuccess,
    });
};
