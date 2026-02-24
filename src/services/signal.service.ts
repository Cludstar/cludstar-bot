import fetch from 'node-fetch';
import { TradeAgentService, TradeSignal } from './trade-agent.service';

export class SignalService {
    private recentTokens = new Set<string>();

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
                // Filter for solana only, avoid stablecoins
                const commonTokenAddresses = [
                    'So11111111111111111111111111111111111111112', // WSOL
                    'EPjFW31p326ce4fk2wgVqsG49Gst3dewdG977hcadHL8', // USDC
                    'Es9vMFrzaDCSTyGv98JT2LBqzJ9stZ9dnVryHLp3p25'  // USDT
                ];

                // Scammers create fake tokens named after major caps to trap search queries.
                // We blacklist these symbols to ensure the agent only buys original/new tokens.
                const imposterSymbols = [
                    'SOL', 'USDC', 'USDT', 'BTC', 'ETH', 'WIF', 'BONK', 'PEPE', 'DOGE', 'SHIB', 'PNUT', 'JUP', 'RAY'
                ];

                const validPairs = data.pairs.filter((p: any) => {
                    const symbol = p.baseToken?.symbol?.toUpperCase() || "";
                    const isImposter = imposterSymbols.includes(symbol);

                    return p.chainId === 'solana' &&
                        !commonTokenAddresses.includes(p.baseToken.address) &&
                        !isImposter &&
                        !this.recentTokens.has(p.baseToken.address) && // Prevent analyzing the same token constantly
                        // "De-gen Discovery": even lower floor for pump.fun specific queries
                        parseFloat(p.liquidity?.usd || "0") > (randomQuery === 'pump.fun' ? 500 : 2000);
                });

                if (validPairs.length > 0) {
                    // Pick completely at random from all valid, unseen pairs to maximize variety
                    const targetPair = validPairs[Math.floor(Math.random() * validPairs.length)];

                    // Add to our rolling cache so we don't look at it again soon
                    this.recentTokens.add(targetPair.baseToken.address);

                    // Simple memory management for the cache
                    if (this.recentTokens.size > 500) {
                        const items = Array.from(this.recentTokens);
                        this.recentTokens = new Set(items.slice(250));
                    }

                    const isPumpFun = targetPair.dexId === 'pump-fun' || targetPair.dexId === 'pumpfun';

                    const signal: TradeSignal = {
                        tokenAddress: targetPair.baseToken.address,
                        symbol: targetPair.baseToken.symbol,
                        reasoning: `De-gen discovery on ${targetPair.dexId}. Liq: $${targetPair.liquidity?.usd || 0}. 5m Buys: ${targetPair.txns?.m5?.buys || 0}`,
                        volume24h: targetPair.volume?.h24,
                        priceUsd: parseFloat(targetPair.priceUsd),
                        isPumpFun: isPumpFun
                    };

                    await this.agent.evaluateSignal(signal);
                }
            }
        } catch (error) {
            console.error("Signal ingestion encountered an error:", error);
        }
    }
}
