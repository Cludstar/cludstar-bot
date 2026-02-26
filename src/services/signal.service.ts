import fetch from 'node-fetch';
import { TradeAgentService, TradeSignal } from './trade-agent.service';

export class SignalService {
    private recentTokens = new Set<string>();

    constructor(private agent: TradeAgentService) { }

    // Dynamic ingestion pipeline for high-frequency signals
    async startMonitoring() {
        console.log("Starting high-frequency signal monitor (3-7s intervals)...");

        const searchLoop = async () => {
            await this.fetchLatestSignals();
            // Faster polling: 2-5 seconds
            const nextInterval = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
            setTimeout(searchLoop, nextInterval);
        };

        const newListingsLoop = async () => {
            await this.fetchNewListings();
            // Brand new listings are high-alpha, check every 8 seconds
            setTimeout(newListingsLoop, 8000);
        };

        searchLoop();
        newListingsLoop();
    }

    private async fetchNewListings() {
        try {
            console.log("Fetching latest token profiles (New Listings)...");
            const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
            const data: any = await response.json();

            // data from this endpoint is an array of token profiles
            if (Array.isArray(data) && data.length > 0) {
                const newSolanaTokens = data.filter((t: any) =>
                    t.chainId === 'solana' &&
                    t.tokenAddress &&
                    !this.recentTokens.has(t.tokenAddress)
                );

                if (newSolanaTokens.length > 0) {
                    // Process up to the 3 newest tokens found in this poll
                    const toProcess = newSolanaTokens.slice(0, 3);

                    for (const newestToken of toProcess) {
                        this.recentTokens.add(newestToken.tokenAddress);

                        // Fetch actual pair data
                        const pairResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${newestToken.tokenAddress}`);
                        const pairData: any = await pairResponse.json();

                        if (pairData.pairs && pairData.pairs.length > 0) {
                            const targetPair = pairData.pairs.sort((a: any, b: any) =>
                                parseFloat(b.liquidity?.usd || "0") - parseFloat(a.liquidity?.usd || "0")
                            )[0]; // Pick deepest liq pair for this token

                            const isPumpFun = targetPair.dexId === 'pump-fun' || targetPair.dexId === 'pumpfun';

                            const signal: TradeSignal = {
                                tokenAddress: targetPair.baseToken.address,
                                symbol: targetPair.baseToken.symbol,
                                reasoning: `💥 ULTRA-EARLY ALERT: Newly listed/migrated token. Liq: $${targetPair.liquidity?.usd || 0}.`,
                                volume24h: targetPair.volume?.h24,
                                priceUsd: parseFloat(targetPair.priceUsd),
                                isPumpFun: isPumpFun
                            };

                            await this.agent.evaluateSignal(signal);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("New Listings ingestion encountered an error:", error);
        }
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
                    // Pick up to 3 random valid, unseen pairs to maximize variety per poll
                    const shuffled = validPairs.sort(() => 0.5 - Math.random());
                    const targets = shuffled.slice(0, 3);

                    for (const targetPair of targets) {
                        // Add to our rolling cache
                        this.recentTokens.add(targetPair.baseToken.address);

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

                    // Simple memory management for the cache
                    if (this.recentTokens.size > 1000) {
                        const items = Array.from(this.recentTokens);
                        this.recentTokens = new Set(items.slice(500));
                    }
                }
            }
        } catch (error) {
            console.error("Signal ingestion encountered an error:", error);
        }
    }
}
