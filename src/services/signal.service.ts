import fetch from 'node-fetch';
import { TradeAgentService, TradeSignal } from './trade-agent.service';

export class SignalService {

    constructor(private agent: TradeAgentService) { }

    // Dynamic ingestion pipeline for high-frequency signals
    async startMonitoring() {
        console.log("Starting high-frequency signal monitor (3-7s intervals)...");

        const runLoop = async () => {
            await this.fetchLatestSignals();

            // Random interval between 3-7 seconds to avoid rate limits and simulate real-time
            const nextInterval = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
            setTimeout(runLoop, nextInterval);
        };

        runLoop();
    }

    private async fetchLatestSignals() {
        try {
            // 1. Fetch from search with 'pump.fun' to catch bonding curves
            // 2. Fetch from search with 'solana' for broad trends
            const queries = ['pump.fun', 'solana'];
            const randomQuery = queries[Math.floor(Math.random() * queries.length)];

            const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${randomQuery}`);
            const data: any = await response.json();

            if (data.pairs && data.pairs.length > 0) {
                // Filter for solana only and basic sanity
                const validPairs = data.pairs.filter((p: any) =>
                    p.chainId === 'solana' &&
                    p.baseToken.address !== 'So11111111111111111111111111111111111111112' &&
                    parseFloat(p.liquidity?.usd || "0") > 5000 // Lowered threshold for earlier discovery
                );

                if (validPairs.length > 0) {
                    // Sort by volume or recently created to find the hottest/newest
                    const hottest = validPairs.sort((a: any, b: any) =>
                        (b.volume?.h1 || 0) - (a.volume?.h1 || 0)
                    ).slice(0, 10);

                    const targetPair = hottest[Math.floor(Math.random() * hottest.length)];

                    const signal: TradeSignal = {
                        tokenAddress: targetPair.baseToken.address,
                        symbol: targetPair.baseToken.symbol,
                        reasoning: `Real-time discovery via ${targetPair.dexId}. Vol(1h): $${targetPair.volume?.h1 || 0}. Liq: $${targetPair.liquidity?.usd || 0}`,
                        volume24h: targetPair.volume?.h24,
                        priceUsd: parseFloat(targetPair.priceUsd)
                    };

                    await this.agent.evaluateSignal(signal);
                }
            }
        } catch (error) {
            console.error("Signal ingestion encountered an error:", error);
        }
    }
}
