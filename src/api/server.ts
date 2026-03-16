import express from 'express';
import cors from 'cors';
import path from 'path';
import { Cortex } from '../engine';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
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

    // Endpoint for real trade logs only
    app.get('/api/trades', async (req, res) => {
        try {
            const db = (brain as any).db; // Access the Supabase client
            const { data, error } = await db
                .from('memories')
                .select('*')
                .in('memory_type', ['episodic'])
                .overlaps('tags', ['trade_execution', 'trade_decision'])
                .order('created_at', { ascending: false })
                .limit(100);
            
            if (error) throw error;
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Endpoint for non-trade memory logs (Dreaming, reasoning, system)
    app.get('/api/memories', async (req, res) => {
        try {
            const db = (brain as any).db;
            const { data, error } = await db
                .from('memories')
                .select('*')
                .in('memory_type', ['episodic', 'procedural', 'semantic'])
                .not('tags', 'overlaps', '{trade_execution,trade_decision}')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            res.json(data);
        } catch (error: any) {
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

    app.listen(port, () => {
        console.log(`Command Center running at http://localhost:${port}`);
    });
}
