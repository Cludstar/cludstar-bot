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
            // Expanded set of search queries for variety
            const searchQueries = [
                'pump.fun',
                'solana',
                'moon',
                'trending',
                'hype',
                'alpha',
                'bonding',
                'pnut',
                'ai',
                'agent'
            ];
            const randomQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];

            const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${randomQuery}`);
            const data: any = await response.json();

            if (data.pairs && data.pairs.length > 0) {
                // Filter for solana only, avoid SOL/USDC/USDT as base tokens
                const commonTokens = [
                    'So11111111111111111111111111111111111111112', // WSOL
                    'EPjFW31p326ce4fk2wgVqsG49Gst3dewdG977hcadHL8', // USDC
                    'Es9vMFrzaDCSTyGv98JT2LBqzJ9stZ9dnVryHLp3p25'  // USDT
                ];

                const validPairs = data.pairs.filter((p: any) =>
                    p.chainId === 'solana' &&
                    !commonTokens.includes(p.baseToken.address) &&
                    parseFloat(p.liquidity?.usd || "0") > 2000 // Even lower for ultra-early gems
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
