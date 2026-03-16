import { startServer } from './api/server';
import { WalletService } from './services/wallet.service';
import { TradeAgentService } from './services/trade-agent.service';
import { SignalService } from './services/signal.service';
import dotenv from 'dotenv';
import { Cortex } from 'clude-bot';

dotenv.config();

async function main() {
    console.log('Starting cludstar...');

    // 1. Initialize Wallet
    const walletService = new WalletService(process.env.BOT_PRIVATE_KEY);
    console.log(`Agent Wallet Address: ${walletService.getPublicKey()}`);

    // Wait for Supabase to be setup manually to initialize Cortex properly.
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.warn("Skipping Cortex initialization: Supabase credentials not found in .env");
        console.warn("Please create a Supabase project, set up the database using `node_modules/clude-bot/supabase-schema.sql` and add your URL/KEY to .env");
        return;
    }

    try {
        console.log('Initializing Cortex Brain...');
        const brain = new Cortex({
            supabase: {
                url: process.env.SUPABASE_URL,
                serviceKey: process.env.SUPABASE_SERVICE_KEY,
            },
            anthropic: {
                apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key_if_not_required',
                model: 'claude-sonnet-4-5-20250929'
            },
            solana: {
                rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
                botWalletPrivateKey: walletService.getSecretKeyBase58()
            }
        });

        await brain.init();
        console.log("Cortex initialized successfully!");

        // 2. Initialize Agent
        const agent = new TradeAgentService(brain, walletService.getKeypair());

        // 3. Initialize Signal Monitor
        const monitor = new SignalService(agent);

        console.log("Booting up signal ingestion pipeline...");
        await monitor.startMonitoring();

        // 4. Start Clude Dream cycles (Self reflection/optimization)
        if (process.env.ANTHROPIC_API_KEY) {
            brain.startDreamSchedule();
            console.log("Dream scheduler started.");
        }

        // 5. Start Position Monitoring (Profit taking / Stop loss)
        setInterval(() => {
            console.log("Triggering scheduled position scan...");
            agent.scanAndEvaluatePositions();
        }, 30 * 1000); // Every 30 seconds

        // --- NEW: High-Frequency Dream Cycle ---
        // Every 20 minutes, the agent reviews its recent memories,
        // connects initial BUY signals with any SELL outcomes (profit/loss),
        // and generates new generalized "trading rules" for its long-term memory.
        setInterval(() => {
            console.log("\n[COGNITIVE EVENT] Initiating high-frequency Dream Cycle (20 min interval)...");
            agent.runDreamCycle();
        }, 20 * 60 * 1000);

        // Initial dream cycle on boot
        agent.runDreamCycle();

        // 6. Start the Web UI API Server
        startServer(brain, walletService.getPublicKey());

    } catch (error) {
        console.error("Failed to initialize system:", error);
    }
}

main().catch(console.error);
