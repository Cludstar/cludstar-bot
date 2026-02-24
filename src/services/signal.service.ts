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
            // In reality, this might filter specifically for pump.fun tokens or certain volume thresholds
            const response = await fetch('https://api.dexscreener.com/latest/dex/search?q=sol'); // Example query
            const data: any = await response.json();

            if (data.pairs && data.pairs.length > 0) {
                // Take the top trending pair as a signal
                const topPair = data.pairs[0];

                const signal: TradeSignal = {
                    tokenAddress: topPair.baseToken.address,
                    symbol: topPair.baseToken.symbol,
                    reasoning: `High volume spike detected on DexScreener. 24h Vol: ${topPair.volume?.h24 || 0}`,
                    volume24h: topPair.volume?.h24,
                    priceUsd: parseFloat(topPair.priceUsd)
                };

                // Pass the signal to the Clude Agent
                await this.agent.evaluateSignal(signal);
            }
        } catch (error) {
            console.error("Error fetching signals:", error);
        }
    }
}
