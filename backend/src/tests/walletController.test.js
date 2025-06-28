const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app'); // Adjust path to your Express app
const { User } = require('../models/User');
const { Wallet } = require('../models/Wallet');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

describe('Wallet API Endpoints', () => {
    let user1, user2, accessToken1, accessToken2, wallet1, wallet2;

    beforeAll(async () => {
        await mongoose.connect('mongodb://localhost:27017/test_neg_ai_banking', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
    });

    afterAll(async () => {
        await mongoose.connection.db.dropDatabase();
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        await User.deleteMany({});
        await Wallet.deleteMany({});

        // Register user1
        user1 = await request(app)
            .post('/api/auth/register')
            .send({
                firstName: 'Ava',
                lastName: 'Lawson',
                email: 'avalawson452@gmail.com',
                password: 'SecurePass1234!',
                phoneNumber: '+2347042449380',
            });
        user1 = user1.body.data;
        wallet1 = await Wallet.findOne({ userId: user1.userId });

        // Register user2
        user2 = await request(app)
            .post('/api/auth/register')
            .send({
                firstName: 'Karl',
                lastName: 'Earnder',
                email: 'karlearnder@gmail.com',
                password: 'SecurePass12345!',
                phoneNumber: '+2347042449381',
            });
        user2 = user2.body.data;
        wallet2 = await Wallet.findOne({ userId: user2.userId });

        // Login user1
        const login1 = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'avalawson452@gmail.com',
                password: 'SecurePass1234!',
            });
        accessToken1 = login1.body.data.accessToken;

        // Login user2
        const login2 = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'karlearnder@gmail.com',
                password: 'SecurePass12345!',
            });
        accessToken2 = login2.body.data.accessToken;
    });

    describe('POST /api/auth/register', () => {
        it('should register a new user successfully', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john.doe@gmail.com',
                    password: 'SecurePass1234!',
                    phoneNumber: '+2347042449382',
                });
            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data).toHaveProperty('userId');
            expect(res.body.data.email).toBe('john.doe@gmail.com');
            expect(res.body.data.accountNumber).toBe('7042449382');
            expect(res.body.data).toHaveProperty('walletId');
        });

        it('should fail if email or phoneNumber is duplicate', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    firstName: 'Ava',
                    lastName: 'Lawson',
                    email: 'avalawson452@gmail.com',
                    password: 'SecurePass1234!',
                    phoneNumber: '+2347042449380',
                });
            expect(res.status).toBe(409);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toBe('Email, phone number, or account number already registered');
        });

        it('should fail if phoneNumber is invalid', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john.doe@gmail.com',
                    password: 'SecurePass1234!',
                    phoneNumber: '+1234567890',
                });
            expect(res.status).toBe(400);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toContain('validation');
        });
    });

    describe('POST /api/auth/login', () => {
        it('should login user successfully', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'avalawson452@gmail.com',
                    password: 'SecurePass1234!',
                });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data).toHaveProperty('accessToken');
            expect(res.body.data).toHaveProperty('refreshToken');
            expect(res.body.data.user).toHaveProperty('accountNumber', '7042449380');
            expect(res.body.data).toHaveProperty('walletId');
        });

        it('should fail with invalid credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'avalawson452@gmail.com',
                    password: 'WrongPass123!',
                });
            expect(res.status).toBe(401);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toBe('Invalid email or password');
        });
    });

    describe('POST /api/wallet/fund', () => {
        it('should initiate wallet funding successfully', async () => {
            const res = await request(app)
                .post('/api/wallet/fund')
                .set('Authorization', `Bearer ${accessToken1}`)
                .send({
                    amount: 25000,
                    accountNumber: '7042449380',
                });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data).toHaveProperty('paymentUrl');
            expect(res.body.data).toHaveProperty('reference');
            expect(res.body.data).toHaveProperty('walletId');
        });

        it('should fail with invalid accountNumber', async () => {
            const res = await request(app)
                .post('/api/wallet/fund')
                .set('Authorization', `Bearer ${accessToken1}`)
                .send({
                    amount: 25000,
                    accountNumber: '1234567890',
                });
            expect(res.status).toBe(400);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toBe('Invalid account number');
        });

        it('should fail if unauthenticated', async () => {
            const res = await request(app)
                .post('/api/wallet/fund')
                .send({
                    amount: 25000,
                    accountNumber: '7042449380',
                });
            expect(res.status).toBe(401);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toContain('Unauthorized');
        });
    });

    describe('POST /api/wallet/verify-payment', () => {
        it('should verify payment and credit wallet successfully', async () => {
            // Mock Flutterwave response
            jest.spyOn(require('axios'), 'get').mockResolvedValue({
                data: {
                    status: 'success',
                    data: {
                        amount: 25000,
                        customer: { email: 'avalawson452@gmail.com' },
                    },
                },
            });

            const res = await request(app)
                .post('/api/wallet/verify-payment')
                .set('Authorization', `Bearer ${accessToken1}`)
                .send({
                    transactionId: '9451993',
                    reference: 'FUND-6d1603c0-81d1-4280-830d-a85f26570ea3',
                });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data).toHaveProperty('balance');
            expect(res.body.data).toHaveProperty('transactionId', '9451993');
            expect(res.body.data).toHaveProperty('reference');
        });

        it('should fail with invalid transactionId', async () => {
            jest.spyOn(require('axios'), 'get').mockRejectedValue(new Error('Invalid transaction'));

            const res = await request(app)
                .post('/api/wallet/verify-payment')
                .set('Authorization', `Bearer ${accessToken1}`)
                .send({
                    transactionId: 'invalid',
                    reference: 'FUND-6d1603c0-81d1-4280-830d-a85f26570ea3',
                });
            expect(res.status).toBe(500);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toContain('Internal server error');
        });
    });

    describe('POST /api/wallet/transfer', () => {
        beforeEach(async () => {
            // Credit user1's wallet for transfer
            await walletService.creditWallet({
                userId: user1.userId,
                amount: 10000,
                reference: `FUND-${uuidv4()}`,
                source: 'flutterwave',
                description: 'Initial funding',
                requestId: 'test-request',
            });
        });

        it('should transfer funds successfully', async () => {
            const res = await request(app)
                .post('/api/wallet/transfer')
                .set('Authorization', `Bearer ${accessToken1}`)
                .send({
                    recipientAccountNumber: '7042449381',
                    amount: 5000,
                    description: 'Test transfer',
                });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.senderTransaction).toHaveProperty('amount', 5000);
            expect(res.body.data.recipientTransaction).toHaveProperty('amount', 5000);
            expect(res.body.data.senderTransaction.target).toBe('7042449381');
        });

        it('should fail if transferring to self', async () => {
            const res = await request(app)
                .post('/api/wallet/transfer')
                .set('Authorization', `Bearer ${accessToken1}`)
                .send({
                    recipientAccountNumber: '7042449380',
                    amount: 5000,
                    description: 'Test transfer',
                });
            expect(res.status).toBe(400);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toBe('Cannot transfer to your own account');
        });

        it('should fail with insufficient balance', async () => {
            const res = await request(app)
                .post('/api/wallet/transfer')
                .set('Authorization', `Bearer ${accessToken1}`)
                .send({
                    recipientAccountNumber: '7042449381',
                    amount: 50000,
                    description: 'Test transfer',
                });
            expect(res.status).toBe(500);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toContain('Internal server error');
        });
    });

    describe('GET /api/wallet/balance', () => {
        it('should retrieve balance successfully', async () => {
            const res = await request(app)
                .get('/api/wallet/balance')
                .set('Authorization', `Bearer ${accessToken1}`);
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data).toHaveProperty('balance');
            expect(res.body.data).toHaveProperty('accountNumber', '7042449380');
        });

        it('should fail if unauthenticated', async () => {
            const res = await request(app).get('/api/wallet/balance');
            expect(res.status).toBe(401);
            expect(res.body.status).toBe('error');
            expect(res.body.message).toContain('Unauthorized');
        });
    });
});