import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import transactionHandler from './api/transactions.js';

const app = express();
app.use(cors());
app.use(express.json());

// Emulate Vercel API routing for local development
app.all('/api/transactions', async (req, res) => {
    return transactionHandler(req, res);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[Local API Wrapper] Backend listening on http://localhost:${PORT}`);
});
