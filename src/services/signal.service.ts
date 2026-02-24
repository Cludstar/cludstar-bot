import fetch from 'node-fetch';
import { TradeAgentService, TradeSignal } from './trade-agent.service';

export class SignalService {

    constructor(private agent: TradeAgentService) { }

    // Mocking an ingestion pipeline from DexScreener and PumpFun
    async startMonitoring() {
        console.log("Starting signal monitor...");

        // Simulating a cron job or WebSocket stream
        setInterval(() => this.fetchTrendingTokens(), 60000); // Check every minute

        // Fetch immediately on startup
        this.fetchTrendingTokens();
    }

    private async fetchTrendingTokens() {
        try {
            // Using DexScreener API as an example for Solana trending
            // Fetching top trending pairs on Solana
            const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=meme');
            const data: any = await response.json();

            if (data.pairs && data.pairs.length > 0) {
                // Filter out wrapped SOL to avoid Jupiter self-swaps
                const validPairs = data.pairs.filter((p: any) =>
                    p.baseToken.address !== 'So11111111111111111111111111111111111111112' &&
                    p.chainId === 'solana' &&
                    parseFloat(p.liquidity?.usd || "0") > 10000 // Ensure some basic liquidity
                );

                if (validPairs.length > 0) {
                    // Pick a random token from the top 10 trending valid pairs
                    const maxIndex = Math.min(10, validPairs.length);
                    const randomPair = validPairs[Math.floor(Math.random() * maxIndex)];

                    const signal: TradeSignal = {
                        tokenAddress: randomPair.baseToken.address,
                        symbol: randomPair.baseToken.symbol,
                        reasoning: `High volume meme token detected on DexScreener. 24h Vol: $${randomPair.volume?.h24 || 0}. Liquidity: $${randomPair.liquidity?.usd || 0}`,
                        volume24h: randomPair.volume?.h24,
                        priceUsd: parseFloat(randomPair.priceUsd)
                    };

                    // Pass the signal to the Clude Agent
                    await this.agent.evaluateSignal(signal);
                }
            }
        } catch (error) {
            console.error("Error fetching signals:", error);
        }
    }
}
