import express from 'express';
import cors from 'cors';
import path from 'path';
import { Cortex } from 'clude-bot';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// Requires brain to be passed in from main initialization
export function startServer(brain: Cortex) {

    app.get('/api/trades', async (req, res) => {
        try {
            // Fetch recent episodic and procedural memories related to trades
            const recentTrades = await brain.recent(24, ['episodic', 'procedural'], 50);
            res.json(recentTrades);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/mission', async (req, res) => {
        // In a real app this would fetch the current wallet balance instead of a static number
        res.json({
            currentBalance: 1.5,
            targetBalance: 100
        });
    });

    app.listen(port, () => {
        console.log(`Command Center running at http://localhost:${port}`);
    });
}
