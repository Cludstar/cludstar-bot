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

    app.listen(port, () => {
        console.log(`Command Center running at http://localhost:${port}`);
    });
}
