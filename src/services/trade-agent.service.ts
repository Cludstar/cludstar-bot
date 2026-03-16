import { Cortex } from 'clude-bot';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';
import { RugCheckService } from './rugcheck.service';

export interface TradeSignal {
    tokenAddress: string;
    symbol: string;
    reasoning: string;
    volume24h?: number;
    priceUsd?: number;
    sentimentScore?: number;
    isPumpFun?: boolean;
    creatorAddress?: string;
}

export class TradeAgentService {
    private brain: Cortex;
    private targetBalance: number = 100;
    private genAI: GoogleGenerativeAI;
    private wallet: Keypair;
    private connection: Connection;
    private rugCheck: RugCheckService;

    constructor(brain: Cortex, wallet: Keypair) {
        this.brain = brain;
        this.wallet = wallet;
        this.connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        this.rugCheck = new RugCheckService();
    }

    public getBrain() {
        return this.brain;
    }

    async evaluateSignal(signal: TradeSignal) {
        console.log(`Evaluating signal for ${signal.symbol}...`);

        // 0. VETO LAYER: Contract Auditing (Triangulation)
        const rugCheckResult = await this.rugCheck.isTokenSafe(signal.tokenAddress);

        if (!rugCheckResult.isSafe) {
            console.log(`[VETO] Signal rejected by RugCheck. Risks: ${rugCheckResult.risks.join(', ')}`);
            await this.brain.store({
                type: 'procedural',
                content: `Signal rejected for ${signal.symbol} due to severe contract risks: ${rugCheckResult.risks.join(', ')}. Score: ${rugCheckResult.score}`,
                summary: `VETO: ${signal.symbol} (RugCheck Failed)`,
                tags: ['trade_decision', signal.symbol, 'SKIP', 'rug_veto'],
                source: 'TradeAgent'
            });
            return; // Exit early
        }

        // 0.5. VETO LAYER: Creator Blacklisting (Memory-based)
        if (signal.creatorAddress) {
            const blacklistMemories = await this.brain.recall({
                query: `blacklisted creator rugger serial rug pull ${signal.creatorAddress}`,
                limit: 1
            });

            if (blacklistMemories.length > 0 && blacklistMemories[0].content.includes(signal.creatorAddress)) {
                console.log(`[VETO] Blocked trade for ${signal.symbol}. Creator ${signal.creatorAddress} is a known rugger.`);
                return; // Instant rejection for known ruggers
            }
        }

        signal.reasoning += ` | RugCheck Pass. Risks: ${rugCheckResult.risks.length > 0 ? rugCheckResult.risks.join(', ') : 'None'}.`;

        // 1. Fetch current wallet balance
        const balanceLamports = await this.connection.getBalance(this.wallet.publicKey);
        const balanceSol = balanceLamports / 1e9;

        // 2. Recall past memories related to tokens like this
        const memories = await this.brain.recall({
            query: `successful trades similar to ${signal.symbol} with high volume`,
            limit: 5,
        });

        const context = this.brain.formatContext(memories);

        // Make an LLM call using the context to decide whether to Buy or Skip.
        const prompt = `You are an autonomous Solana trading agent.
Your goal is to grow the portfolio from 1 SOL to 100 SOL.

Current Portfolio Status:
- Wallet Balance: ${balanceSol.toFixed(4)} SOL
- Target: ${this.targetBalance} SOL

Incoming Signal (Audited for safety):
${JSON.stringify(signal)}

Here are some relevant past trading memories:
${context}

Based on this information, evaluate the trade and provide a Confidence Score (1-100).
A score above 60 means you want to BUY. A score 60 or below means SKIP.

Respond with a JSON object in this exact format:
{
  "decision": "BUY" | "SKIP",
  "confidenceScore": number (1-100),
  "reasoning": "A concise 1-sentence explanation of your decision based on the patterns"
}`;

        console.log("Consulting Gemini for decision...");
        let decision = "SKIP";
        let llmReasoning = "Default Fallback";
        let amountSol = 0;
        let confidenceScore = 0;

        try {
            const model = this.genAI.getGenerativeModel({ 
                model: 'gemini-2.5-flash',
                generationConfig: { maxOutputTokens: 1024, responseMimeType: 'application/json' }
            });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            // Extract JSON from Gemini's response (strip markdown code fences if present)
            let cleanedResponse = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                decision = parsed.decision === 'BUY' ? 'BUY' : 'SKIP';
                confidenceScore = parsed.confidenceScore || 0;
                llmReasoning = parsed.reasoning || "No reasoning provided by LLM.";

                if (decision === 'BUY' && confidenceScore > 40) {
                    // --- Aggressive Scalper Risk Sizing ---
                    // Max risk per trade: 10% of portfolio (capped at 0.1 SOL)
                    // Min risk per trade: 5% of portfolio
                    const maxRiskPct = 0.1;
                    const minRiskPct = 0.05;

                    // Scale from 0 to 1 based on how far above 40 the score is (max is 100-40 = 60)
                    const confidenceScale = Math.min(1, Math.max(0, (confidenceScore - 40) / 60));
                    const riskPct = minRiskPct + (maxRiskPct - minRiskPct) * confidenceScale;

                    amountSol = balanceSol * riskPct;

                    // Safety boundaries Check: Leave room for slippage/fees (buffer: 0.005 SOL)
                    const maxTradeAbsolute = 0.1; // Hard max of 0.1 SOL at 100% confidence
                    const availableToSpend = Math.max(0, balanceSol - 0.005);
                    amountSol = Math.min(amountSol, maxTradeAbsolute, availableToSpend);

                    if (amountSol < 0.001) {
                        decision = 'SKIP';
                        llmReasoning += ` | Scaled amount (${amountSol.toFixed(4)}) was too small. Skipping.`;
                    } else {
                        llmReasoning += ` | Algorithm scaled trade to ${amountSol.toFixed(3)} SOL based on ${confidenceScore}/100 confidence.`;
                    }
                } else {
                    decision = 'SKIP';
                    amountSol = 0;
                }
            } else {
                llmReasoning = "Failed to parse JSON from LLM: " + responseText;
            }
        } catch (err: any) {
            console.error("LLM Generation Error:", err.message);
            llmReasoning = `Error querying Gemini API: ${err.message}`;
        }

        console.log(`Decision: ${decision} (Confidence: ${confidenceScore})\nReason: ${llmReasoning}`);

        // 2. Store the reasoning and decision
        await this.brain.store({
            type: 'procedural',
            content: `Signal received for ${signal.symbol} (${signal.tokenAddress}). Decision: ${decision}. Confidence: ${confidenceScore}. Reasoning: ${llmReasoning}. Initial signal data: ${JSON.stringify(signal)}`,
            summary: `Trade decision for ${signal.symbol} (${confidenceScore}/100)`,
            tags: ['trade_decision', signal.symbol, decision],
            source: 'TradeAgent'
        });

        if (decision === 'BUY' && amountSol > 0) {
            if (signal.isPumpFun) {
                await this.executePumpFunTrade(signal, amountSol);
            } else {
                await this.executeTrade(signal, amountSol);
            }
        }
    }

    private async executePumpFunTrade(signal: TradeSignal, amountSol: number) {
        console.log(`Executing direct Pump.fun swap via PumpPortal for ${signal.symbol} with ${amountSol} SOL...`);
        let txHash = "pending...";

        try {
            // Using PumpPortal's local transaction API for serialized transaction
            const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    publicKey: this.wallet.publicKey.toString(),
                    action: "buy",
                    mint: signal.tokenAddress,
                    amount: amountSol,
                    denominatedInSol: "true",
                    slippage: 10,
                    priorityFee: 0.008,
                    pool: "pump"
                })
            });

            if (response.status !== 200) {
                const errorText = await response.text();
                throw new Error(`PumpPortal API Error: ${errorText}`);
            }

            const txBuffer = Buffer.from(await response.arrayBuffer());
            const transaction = VersionedTransaction.deserialize(txBuffer);
            transaction.sign([this.wallet]);

            const rawTransaction = transaction.serialize();
            txHash = await this.connection.sendRawTransaction(rawTransaction, {
                skipPreflight: true,
                maxRetries: 2
            });

            // Confirmation
            const blockhash = await this.connection.getLatestBlockhash();
            await this.connection.confirmTransaction({
                blockhash: blockhash.blockhash,
                lastValidBlockHeight: blockhash.lastValidBlockHeight,
                signature: txHash
            });

            console.log(`Pump.fun Trade executed! TX Hash: ${txHash}`);
        } catch (error: any) {
            console.error("Pump.fun Trade execution failed:", error.message);
            txHash = `FAILED: ${error.message}`;
        }

        await this.brain.store({
            type: 'episodic',
            content: `Attempted to buy ${signal.symbol} on Pump.fun. Status: ${txHash}.`,
            summary: `Pump.fun BUY on ${signal.symbol} (${txHash.startsWith('FAILED') ? 'FAIL' : 'SUCCESS'})`,
            tags: ['trade_execution', 'buy', signal.symbol, txHash, 'pumpfun'],
            source: 'TradeAgent'
        });
    }

    private async executeTrade(signal: TradeSignal, amountSol: number) {
        console.log(`Executing Jupiter swap for ${signal.symbol} with ${amountSol} SOL...`);

        let txHash = "pending...";
        try {
            // Convert SOL to lamports
            const amountLamports = Math.floor(amountSol * 1e9);

            // 1. Fetch quote from Jupiter V6 with strict 50% slippage for volatile tokens, avoiding dynamic optimizer overrides
            const quoteResponse: any = await (
                await fetch(`https://public.jupiterapi.com/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${signal.tokenAddress}&amount=${amountLamports}&slippageBps=5000`)
            ).json();

            if (quoteResponse.error) {
                throw new Error(`Jupiter Quote Error: ${quoteResponse.error}`);
            }

            // 2. Fetch serialized swap transaction from Jupiter
            const swapData: any = await (
                await fetch('https://public.jupiterapi.com/swap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: this.wallet.publicKey.toString(),
                        wrapAndUnwrapSol: true,
                        asLegacyTransaction: false, // Forces Versioned Tx for Token-2022 support
                        dynamicComputeUnitLimit: true,
                        prioritizationFeeLamports: "auto"
                    })
                })
            ).json();

            const { swapTransaction } = swapData;

            if (!swapTransaction) {
                throw new Error('Failed to retrieve swapTransaction from Jupiter');
            }

            // 3. Deserialize and sign
            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([this.wallet]);

            // 4. Send and confirm on-chain
            const rawTransaction = transaction.serialize();
            txHash = await this.connection.sendRawTransaction(rawTransaction, {
                skipPreflight: true,
                maxRetries: 2
            });

            // Optional: wait for confirmation to ensure it landed
            const blockhash = await this.connection.getLatestBlockhash();
            await this.connection.confirmTransaction({
                blockhash: blockhash.blockhash,
                lastValidBlockHeight: blockhash.lastValidBlockHeight,
                signature: txHash
            });

            console.log(`Real Jupiter Trade executed! TX Hash: ${txHash}`);
        } catch (error: any) {
            console.error("Real Trade execution failed:", error.message);
            txHash = `FAILED: ${error.message}`;
        }

        // Store trade success/failure with the TX Hash or Error in Clude
        await this.brain.store({
            type: 'episodic',
            content: `Attempted to buy ${signal.symbol}. Status: ${txHash}.`,
            summary: `Jupiter BUY on ${signal.symbol} (${txHash.startsWith('FAILED') ? 'FAIL' : 'SUCCESS'})`,
            tags: ['trade_execution', 'buy', signal.symbol, txHash],
            source: 'TradeAgent'
        });
    }

    async runDreamCycle() {
        console.log('Running Dream Cycle to consolidate trade learnings...');

        // Trigger Clude's dream cycle to optimize strategy based on won/lost trades
        try {
            await this.brain.dream({
                onEmergence: async (thought: string) => {
                    console.log(`Agent Insight: ${thought}`);
                }
            });
        } catch (e: any) {
            console.error('Dream cycle skipped or failed (Gemini config may be missing):', e.message);
        }
    }

    /**
     * Scans wallet for tokens and decides whether to sell
     */
    async scanAndEvaluatePositions() {
        console.log("Scanning wallet for token positions...");
        try {
            // 1. Get token accounts
            const parsedTokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                this.wallet.publicKey,
                {
                    programId: new Connection('https://api.mainnet-beta.solana.com').rpcEndpoint.includes('mainnet') ?
                        new (require('@solana/web3.js').PublicKey)('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') :
                        new (require('@solana/web3.js').PublicKey)('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
                }
            );
            // Note: Also need to check Token-2022
            const token2022Accounts = await this.connection.getParsedTokenAccountsByOwner(
                this.wallet.publicKey,
                { programId: new (require('@solana/web3.js').PublicKey)('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') }
            );

            const allAccounts = [...parsedTokenAccounts.value, ...token2022Accounts.value];

            for (const account of allAccounts) {
                const info = account.account.data.parsed.info;
                const mint = info.mint;
                const balance = info.tokenAmount.uiAmount;

                if (balance > 0) {
                    console.log(`Found position: ${balance} of ${mint}`);
                    await this.evaluateSell(mint, balance);
                }
            }
        } catch (error) {
            console.error("Position scanning failed:", error);
        }
    }

    private async evaluateSell(mint: string, balance: number) {
        // 1. Recall entry memory
        const memories = await this.brain.recall({
            query: `buy trade for token ${mint}`,
            limit: 1
        });

        const entryContext = memories.length > 0 ? this.brain.formatContext(memories) : "No entry memory found.";

        // 2. Get current price and platform info
        const dexResp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        const dexData: any = await dexResp.json();
        const pair = dexData.pairs?.[0];
        const currentPrice = pair ? parseFloat(pair.priceUsd) : 0;
        const symbol = pair ? pair.baseToken.symbol : mint.slice(0, 4);
        const isPumpFun = pair?.dexId === 'pump-fun' || pair?.dexId === 'pumpfun';

        // 3. Extract entry price and apply hard STOP-LOSS / TAKE-PROFIT rules
        let entryPrice = 0;
        const priceMatch = entryContext.match(/"priceUsd"\s*:\s*([\d.]+)/);
        if (priceMatch && priceMatch[1]) {
            entryPrice = parseFloat(priceMatch[1]);
        }

        if (entryPrice > 0) {
            // SCALPING: -10% Hard Stop Loss
            if (currentPrice < (entryPrice * 0.90)) {
                console.log(`[STOP LOSS] ${symbol} price ($${currentPrice}) is < -10% of entry ($${entryPrice}). Taking hard stop.`);
                const sellAmount = balance; // sell all
                if (isPumpFun) {
                    await this.executePumpFunSell(mint, symbol, sellAmount, "Scalp Stop Loss Triggered (-10%)");
                } else {
                    await this.executeSell(mint, symbol, sellAmount, "Scalp Stop Loss Triggered (-10%)");
                }
                return; // Skip LLM evaluation
            }

            // SCALPING: +15% Hard Take Profit
            if (currentPrice > (entryPrice * 1.15)) {
                console.log(`[TAKE PROFIT] ${symbol} price ($${currentPrice}) is > +15% of entry ($${entryPrice}). Securing profit.`);
                const sellAmount = balance; // sell all
                if (isPumpFun) {
                    await this.executePumpFunSell(mint, symbol, sellAmount, "Scalp Take Profit Triggered (+15%)");
                } else {
                    await this.executeSell(mint, symbol, sellAmount, "Scalp Take Profit Triggered (+15%)");
                }
                return; // Skip LLM evaluation
            }
        }

        const prompt = `You are an autonomous Solana trading agent.
Current Position:
- Token: ${symbol} (${mint})
- Held Balance: ${balance}
- Current Price: $${currentPrice}

Past Knowledge/Entry Info:
${entryContext}

Current Wallet Context:
- Target: ${this.targetBalance} SOL

Based on your knowledge and experience, should you SELL this token?
You can decide to sell ALL, PART, or HOLD (SKIP).

Respond with a JSON object in this exact format:
{
  "decision": "SELL" | "SKIP",
  "reasoning": "A concise explanation for the sell/hold decision",
  "amountToken": number (amount of tokens to sell if decision is SELL)
}`;

        console.log(`Consulting LLM for SELL decision on ${symbol}...`);
        try {
            const model = this.genAI.getGenerativeModel({ 
                model: 'gemini-2.5-flash',
                generationConfig: { maxOutputTokens: 1024, responseMimeType: 'application/json' }
            });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            // Strip markdown code fences from Gemini response
            let cleanedResponse = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.decision === 'SELL' && parsed.amountToken > 0) {
                    const sellAmount = Math.min(parsed.amountToken, balance);
                    console.log(`Executing SELL for ${symbol}: ${sellAmount}`);
                    if (isPumpFun) {
                        await this.executePumpFunSell(mint, symbol, sellAmount, parsed.reasoning);
                    } else {
                        await this.executeSell(mint, symbol, sellAmount, parsed.reasoning);
                    }
                }
            }
        } catch (err: any) {
            console.error("Sell evaluation error:", err.message);
        }
    }

    private async executePumpFunSell(mint: string, symbol: string, amount: number, reasoning: string) {
        console.log(`Executing direct Pump.fun SELL via PumpPortal for ${symbol}...`);
        let txHash = "pending...";

        try {
            const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    publicKey: this.wallet.publicKey.toString(),
                    action: "sell",
                    mint: mint,
                    amount: amount,
                    denominatedInSol: "false", // We are selling token amount
                    slippage: 10,
                    priorityFee: 0.005,
                    pool: "pump"
                })
            });

            if (response.status !== 200) {
                const errorText = await response.text();
                throw new Error(`PumpPortal API Error: ${errorText}`);
            }

            const txBuffer = Buffer.from(await response.arrayBuffer());
            const transaction = VersionedTransaction.deserialize(txBuffer);
            transaction.sign([this.wallet]);

            const rawTransaction = transaction.serialize();
            txHash = await this.connection.sendRawTransaction(rawTransaction, { skipPreflight: true });

            console.log(`Pump.fun SELL executed! TX Hash: ${txHash}`);
        } catch (error: any) {
            console.error("Pump.fun SELL execution failed:", error.message);
            txHash = `FAILED: ${error.message}`;
        }

        await this.brain.store({
            type: 'procedural',
            content: `Attempted to sell ${amount} of ${symbol} on Pump.fun. Status: ${txHash}. Reasoning: ${reasoning}`,
            summary: `Pump.fun SELL ${symbol} (${txHash.startsWith('FAILED') ? 'FAIL' : 'SUCCESS'})`,
            tags: ['trade_execution', 'sell', symbol, txHash, 'pumpfun'],
            source: 'TradeAgent'
        });
    }

    private async executeSell(mint: string, symbol: string, amount: number, reasoning: string) {
        console.log(`Executing Jupiter swap for SELL ${symbol}...`);

        let txHash = "pending...";
        try {
            // 1. Fetch token decimals dynamically from the chain
            const mintPublicKey = new PublicKey(mint);
            const mintInfo = await this.connection.getParsedAccountInfo(mintPublicKey);
            let decimals = 6; // Fallback to 6
            
            if (mintInfo.value && 'parsed' in mintInfo.value.data) {
                decimals = (mintInfo.value.data as any).parsed.info.decimals;
            }

            const amountAtoms = Math.floor(amount * Math.pow(10, decimals));

            // 2. Get quote (Token -> SOL)
            const quoteResponse: any = await (
                await fetch(`https://public.jupiterapi.com/quote?inputMint=${mint}&outputMint=So11111111111111111111111111111111111111112&amount=${amountAtoms}&slippageBps=1000`)
            ).json();

            if (quoteResponse.error) throw new Error(quoteResponse.error);

            // 2. Swap
            const swapData: any = await (
                await fetch('https://public.jupiterapi.com/swap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: this.wallet.publicKey.toString(),
                        asLegacyTransaction: false,
                        dynamicComputeUnitLimit: true,
                        prioritizationFeeLamports: "auto"
                    })
                })
            ).json();

            const { swapTransaction } = swapData;

            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([this.wallet]);

            const rawTransaction = transaction.serialize();
            txHash = await this.connection.sendRawTransaction(rawTransaction, { skipPreflight: true });

            console.log(`SELL executed! TX: ${txHash}`);
        } catch (e: any) {
            console.error(`Sell failed for ${symbol}:`, e.message);

            // Check if it's a "No routes found" error (Common when Liquidity is removed / Rug Pull)
            if (e.message.toLowerCase().includes('route')) {
                txHash = `FAILED_NO_LIQUIDITY`;

                // LEVEL 4: Auto-Blacklist Creator
                try {
                    console.log(`[Rug Pull] Attempting to identify and blacklist creator for ${mint}...`);
                    const response = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`);
                    const data: any = await response.json();
                    const creator = data.creator;

                    if (creator) {
                        await this.brain.store({
                            type: 'procedural',
                            content: `BLACKBOARD: Creator ${creator} of ${symbol} (${mint}) is a confirmed rugger. Blacklisted for all future signals.`,
                            summary: `BLACKBOARD: Rugger Blacklisted (${creator})`,
                            tags: ['blacklist', 'rug_pull', symbol, mint, 'BLACKBOARD', creator],
                            source: 'TradeAgent'
                        });
                        console.log(`[VETO] Successfully blacklisted creator ${creator} for ${symbol}.`);
                    }
                } catch (e: any) {
                    console.warn(`[Rug Pull] Could not fetch creator for ${mint} to blacklist: ${e.message}`);
                }

                // Store a specific episodic memory for Rug Pull detection
                await this.brain.store({
                    type: 'episodic',
                    content: `Severe Failure: Attempted to sell ${symbol} (${mint}) but received 'No routes found'. This typically means liquidity was completely removed (Rug Pull).`,
                    summary: `RUG PULL DETECTED: ${symbol} Liquidity Removed`,
                    tags: ['trade_execution', 'sell', 'rug_pull', symbol, 'FAILED_NO_LIQUIDITY'],
                    source: 'TradeAgent'
                });
                return; // Exit early since we already stored the specific memory
            } else {
                txHash = `FAILED: ${e.message}`;
            }
        }

        await this.brain.store({
            type: 'procedural',
            content: `Attempted to sell ${amount} of ${symbol} (${mint}). Status: ${txHash}. Reasoning: ${reasoning}`,
            summary: `SELL ${symbol} (${txHash.startsWith('FAILED') ? 'FAIL' : 'SUCCESS'})`,
            tags: ['trade_execution', 'sell', symbol, txHash],
            source: 'TradeAgent'
        });
    }
}
