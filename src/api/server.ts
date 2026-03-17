import express from 'express';
import cors from 'cors';
import path from 'path';
import { Cortex } from '../engine';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import dotenv from 'dotenv';
import { NATIVE_MINT } from '@solana/spl-token';
import { PumpAgent } from '@pump-fun/agent-payments-sdk';
import { BN } from '@coral-xyz/anchor';
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// Requires brain to be passed in from main initialization
export function startServer(brain: Cortex, walletPublicKey: string) {
    const connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
    const pubKey = new PublicKey(walletPublicKey);

    // Endpoint for all standard agent actions and logs
    app.get('/api/trades', async (req, res) => {
        try {
            console.log("GET /api/trades - Fetching latest trade memories...");
            const db = (brain as any).db;
            const { data, error } = await db
                .from('memories')
                .select('*')
                .in('memory_type', ['episodic', 'procedural'])
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (error) {
                console.error("Supabase error in /api/trades:", error);
                throw error;
            }
            console.log(`GET /api/trades - Found ${data?.length || 0} memories`);
            res.json(data || []);
        } catch (error: any) {
            console.error("Error in /api/trades:", error);
            res.status(500).json({ error: error.message });
        }
    });

    // Endpoint for non-trade memory logs (Dreaming, reasoning, system)
    app.get('/api/memories', async (req, res) => {
        try {
            console.log("GET /api/memories - Fetching system memories...");
            const db = (brain as any).db;
            const { data, error } = await db
                .from('memories')
                .select('*')
                .not('tags', 'cs', '{"trade_execution"}')
                .not('tags', 'cs', '{"trade_decision"}')
                .not('tags', 'cs', '{"rug_veto"}')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) {
                console.error("Supabase error in /api/memories:", error);
                throw error;
            }

            console.log(`GET /api/memories - Found ${data?.length || 0} relevant memories`);
            res.json(data || []);
        } catch (error: any) {
            console.error("Error in /api/memories:", error);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/mission', async (req, res) => {
        try {
            const lamports = await connection.getBalance(pubKey);
            const sol = lamports / 1e9;
            res.json({
                currentBalance: parseFloat(sol.toFixed(4)),
                targetBalance: 100,
                walletAddress: pubKey.toString()
            });
        } catch (error: any) {
            console.error("Failed to fetch balance:", error);
            res.status(500).json({ error: error.message });
        }
    });

    // --- RNG Payment Implementation ---
    const AGENT_TOKEN = new PublicKey('2WVTfBD8ZfN4JwDFpfPvugWeJFy3FRC12Bw4QowFpump');

    app.post('/api/payment/invoice', async (req, res) => {
        try {
            const { userWallet } = req.body;
            if (!userWallet) return res.status(400).json({ error: "Missing wallet" });

            const agent = new PumpAgent(AGENT_TOKEN, "mainnet", connection);
            const userPubKey = new PublicKey(userWallet);

            const amount = 0;
            const memo = Math.floor(Math.random() * 1000000);
            const startTime = Math.floor(Date.now() / 1000);
            const endTime = startTime + 3600;

            const instructions = await agent.buildAcceptPaymentInstructions({
                user: userPubKey,
                currencyMint: NATIVE_MINT,
                amount,
                memo,
                startTime,
                endTime
            });

            const transaction = new Transaction().add(...instructions);
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userPubKey;

            const serializedTransaction = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
            }).toString('base64');

            res.json({
                transaction: serializedTransaction,
                paymentParams: {
                    user: userWallet,
                    currencyMint: NATIVE_MINT.toBase58(),
                    amount,
                    memo,
                    startTime,
                    endTime
                }
            });
        } catch (error: any) {
            console.error("Express Invoice error:", error);
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/payment/verify', async (req, res) => {
        try {
            const { paymentParams } = req.body;
            if (!paymentParams) return res.status(400).json({ error: "Missing params" });

            const agent = new PumpAgent(AGENT_TOKEN, "mainnet", connection);

            const isValid = await agent.validateInvoicePayment({
                user: new PublicKey(paymentParams.user),
                currencyMint: new PublicKey(paymentParams.currencyMint),
                amount: Number(paymentParams.amount),
                memo: Number(paymentParams.memo),
                startTime: Number(paymentParams.startTime),
                endTime: Number(paymentParams.endTime)
            });

            if (isValid) {
                res.json({ success: true, result: Math.floor(Math.random() * 1001) });
            } else {
                res.status(402).json({ success: false, error: "Verification failed" });
            }
        } catch (error: any) {
            console.error("Express Verify error:", error);
            res.status(500).json({ error: error.message });
        }
    });

    app.listen(port, () => {
        console.log(`Command Center running at http://localhost:${port}`);
    });
}
