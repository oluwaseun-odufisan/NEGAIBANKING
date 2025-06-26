import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import Alert from '../components/Alert';

function Kyc() {
    const [formData, setFormData] = useState({
        idType: 'nin',
        idNumber: '',
        idImage: null,
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const mutation = useMutation({
        mutationFn: (data) => {
            const form = new FormData();
            form.append('idType', data.idType);
            form.append('idNumber', data.idNumber);
            form.append('idImage', data.idImage);
            return api.post('/api/kyc/submit', form);
        },
        onSuccess: () => {
            setSuccess('KYC submitted successfully');
            setFormData({ idType: 'nin', idNumber: '', idImage: null });
        },
        onError: (err) => {
            setError(err.response?.data?.message || 'KYC submission failed');
        },
    });

    const handleChange = (e) => {
        if (e.target.name === 'idImage') {
            setFormData({ ...formData, idImage: e.target.files[0] });
        } else {
            setFormData({ ...formData, [e.target.name]: e.target.value });
        }
    };

    const handleSubmit = () => {
        mutation.mutate(formData);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">KYC Verification</h1>
            {error && <Alert type="error" message={error} onClose={() => setError('')} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}
            <div className="bg-white p-4 rounded-lg shadow">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="idType" className="block text-sm font-medium">
                            ID Type
                        </label>
                        <select
                            id="idType"
                            name="idType"
                            value={formData.idType}
                            onChange={handleChange}
                            className="p-2 w-full border rounded focus:ring focus:ring-primary"
                            aria-label="ID type"
                        >
                            <option value="nin">NIN</option>
                            <option value="passport">Passport</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="idNumber" className="block text-sm font-medium">
                            ID Number
                        </label>
                        <input
                            id="idNumber"
                            name="idNumber"
                            type="text"
                            value={formData.idNumber}
                            onChange={handleChange}
                            className="p-2 w-full border rounded focus:ring focus:ring-primary"
                            aria-label="ID number"
                        />
                    </div>
                    <div>
                        <label htmlFor="idImage" className="block text-sm font-medium">
                            ID Image
                        </label>
                        <input
                            id="idImage"
                            name="idImage"
                            type="file"
                            onChange={handleChange}
                            className="p-2 w-full border rounded"
                            aria-label="ID image upload"
                        />
                    </div>
                    <button
                        onClick={handleSubmit}
                        className="w-full bg-primary text-white p-2 rounded hover:bg-blue-700"
                        disabled={mutation.isLoading}
                    >
                        Submit KYC
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Kyc;
