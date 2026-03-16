import { Cortex } from 'clude-bot';
import { Keypair } from '@solana/web3.js';
import { TradeAgentService } from './src/services/trade-agent.service';
import { WalletService } from './src/services/wallet.service';
import bs58 from 'bs58';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const privateKeyString = process.env.BOT_PRIVATE_KEY;
    if (!privateKeyString) throw new Error('Missing BOT_PRIVATE_KEY in .env');
    const walletService = new WalletService(privateKeyString);
    const wallet = walletService.getKeypair();

    const brain = new Cortex({
        supabase: {
            url: process.env.SUPABASE_URL || '',
            serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
        },
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY || 'dummy',
            model: 'claude-3-haiku-20240307'
        },
        solana: {
            rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
            botWalletPrivateKey: walletService.getSecretKeyBase58()
        }
    });

    await brain.init();

    const agent = new TradeAgentService(brain, wallet);

    const signal = {
        tokenAddress: 'oBeMrKMEqaLN8hYeuTiHDx91MXTP5zrsuKnhS2Spump',
        symbol: 'PUMP',
        reasoning: 'Manual test buy triggered locally by user request',
        volume24h: 1000000,
        priceUsd: 0.5
    };

    console.log(`Bypassing signal ingestion and forcing Jupiter swap for test token...`);

    // @ts-ignore - bypassing private modifier for local testing
    await agent.executeTrade(signal);

    console.log(`Test script complete.`);
    process.exit(0);
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
