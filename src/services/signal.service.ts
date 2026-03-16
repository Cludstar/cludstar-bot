import fetch from 'node-fetch';
import { TradeAgentService, TradeSignal } from './trade-agent.service';

export class SignalService {
    private recentTokens = new Set<string>();

    constructor(private agent: TradeAgentService) { }

    // Dynamic ingestion pipeline for high-frequency signals
    async startMonitoring() {
        console.log("Starting high-frequency signal monitor (3-7s intervals)...");

        const trendingLoop = async () => {
            await this.fetchPumpTrending();
            setTimeout(trendingLoop, 10000); // Top Runners every 10s
        };

        const newestLoop = async () => {
            await this.fetchPumpNewest();
            setTimeout(newestLoop, 5000); // Newest creations every 5s
        };

        const migratedLoop = async () => {
            await this.fetchPumpMigrated();
            setTimeout(migratedLoop, 20000); // Recently migrated every 20s
        };

        const almostBondedLoop = async () => {
            await this.fetchPumpAlmostBonded();
            setTimeout(almostBondedLoop, 15000); // Almost bonded every 15s
        };

        const dexSearchLoop = async () => {
            await this.fetchLatestSignals();
            // Fallback/Variety from DexScreener every 30s
            setTimeout(dexSearchLoop, 30000);
        };

        trendingLoop();
        newestLoop();
        migratedLoop();
        almostBondedLoop();
        dexSearchLoop();
    }

    private async processPumpCoins(coins: any[], reasoningPrefix: string) {
        if (!Array.isArray(coins) || coins.length === 0) return;

        // Process up to 5 tokens per batch to handle the high density.
        // Filter out tokens with < $5000 market cap to avoid spamming the LLM with dust/scam tokens.
        const toProcess = coins
            .filter(c => c.mint && !this.recentTokens.has(c.mint))
            .filter(c => {
                const mc = c.usd_market_cap || (c.coin ? c.coin.usd_market_cap : 0);
                return mc > 2000;
            })
            .slice(0, 5);

        for (const item of toProcess) {
            // Handle both structure: { coin: {...} } (Top Runners) and {...} (Normal Lists)
            const coin = item.coin ? item.coin : item;

            this.recentTokens.add(coin.mint);

            // For Pump.fun tokens, we can construct the signal directly from the batch data
            // which often includes market cap and basic info
            const signal: TradeSignal = {
                tokenAddress: coin.mint,
                symbol: coin.symbol,
                reasoning: `${reasoningPrefix}. MC: $${Math.round(coin.usd_market_cap || 0)}. Bonding: ${Math.round(coin.bonding_curve_progress || 0)}%.`,
                priceUsd: coin.price_usd || 0,
                isPumpFun: true,
                creatorAddress: coin.creator
            };

            await this.agent.evaluateSignal(signal);
        }

        // Cache management
        if (this.recentTokens.size > 2000) {
            const items = Array.from(this.recentTokens);
            this.recentTokens = new Set(items.slice(1000));
        }
    }

    private async fetchPumpTrending() {
        try {
            console.log("Fetching Pump.fun Top Runners...");
            const response = await fetch('https://frontend-api-v3.pump.fun/coins/top-runners');
            const data: any = await response.json();
            await this.processPumpCoins(data, "🔥 PUMP TRENDING (Top Runners)");
        } catch (error) {
            console.error("fetchPumpTrending failed:", error);
        }
    }

    private async fetchPumpNewest() {
        try {
            console.log("Fetching Pump.fun Newest Listings...");
            const url = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&includeNsfw=false&order=DESC';
            const response = await fetch(url);
            const data: any = await response.json();
            await this.processPumpCoins(data, "✨ PUMP NEWEST (Bonding Curve)");
        } catch (error) {
            console.error("fetchPumpNewest failed:", error);
        }
    }

    private async fetchPumpMigrated() {
        try {
            console.log("Fetching Pump.fun Recently Migrated...");
            // Market cap sort usually shows the biggest/completed ones
            const url = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=market_cap&includeNsfw=false&order=DESC';
            const response = await fetch(url);
            const data: any = await response.json();

            // Filter for only completed tokens in this batch
            const migrated = Array.isArray(data) ? data.filter((c: any) => c.complete === true) : [];
            await this.processPumpCoins(migrated, "🚀 PUMP MIGRATED (Raydium/PumpSwap)");
        } catch (error) {
            console.error("fetchPumpMigrated failed:", error);
        }
    }

    private async fetchPumpAlmostBonded() {
        try {
            console.log("Fetching Pump.fun Almost Bonded...");
            // High market cap but NOT complete = Almost Bonded
            const url = 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=market_cap&includeNsfw=false&order=DESC';
            const response = await fetch(url);
            const data: any = await response.json();

            const almostBonded = Array.isArray(data) ? data.filter((c: any) => c.complete === false) : [];
            await this.processPumpCoins(almostBonded, "💎 PUMP ALMOST BONDED (90%+)");
        } catch (error) {
            console.error("fetchPumpAlmostBonded failed:", error);
        }
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
                        // SCALPING: Strict liquidity and volume floors
                        parseFloat(p.liquidity?.usd || "0") > 15000 &&
                        parseFloat(p.volume?.h24 || "0") > 50000;
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
