import { Cortex } from 'clude-bot';
import Anthropic from '@anthropic-ai/sdk';
import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

export interface TradeSignal {
    tokenAddress: string;
    symbol: string;
    reasoning: string;
    volume24h?: number;
    priceUsd?: number;
    sentimentScore?: number;
}

export class TradeAgentService {
    private brain: Cortex;
    private targetBalance: number = 100;
    private anthropic: Anthropic;
    private wallet: Keypair;
    private connection: Connection;

    constructor(brain: Cortex, wallet: Keypair) {
        this.brain = brain;
        this.wallet = wallet;
        this.connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || '',
        });
    }

    async evaluateSignal(signal: TradeSignal) {
        console.log(`Evaluating signal for ${signal.symbol}...`);

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

Incoming Signal:
${JSON.stringify(signal)}

Here are some relevant past trading memories:
${context}

Based on this information, should you BUY or SKIP this token?
If you decide to BUY, also decide the AMOUNT (in SOL) to spend based on your current balance and risk assessment.

Respond with a JSON object in this exact format:
{
  "decision": "BUY" | "SKIP",
  "reasoning": "A concise 1-sentence explanation of your decision based on the patterns",
  "amountSol": number (required if decision is BUY, otherwise 0)
}`;

        console.log("Consulting Claude 3 Haiku for decision...");
        let decision = "SKIP";
        let llmReasoning = "Default Fallback";
        let amountSol = 0;

        try {
            const response = await this.anthropic.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 200,
                messages: [{ role: 'user', content: prompt }]
            });
            const responseText = (response.content[0] as any).text;

            // Extract JSON from Claude's response
            const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                decision = parsed.decision === 'BUY' ? 'BUY' : 'SKIP';
                llmReasoning = parsed.reasoning || "No reasoning provided by LLM.";
                amountSol = parsed.amountSol || 0;

                // Safety check: Don't spend more than 50% of balance or 10 SOL whichever is smaller for now
                const maxTrade = Math.min(balanceSol * 0.5, 10);
                if (decision === 'BUY' && (amountSol <= 0 || amountSol > maxTrade)) {
                    console.warn(`LLM suggested unsafe trade amount: ${amountSol} SOL. Scaling down to safety limit.`);
                    amountSol = Math.max(0.01, Math.min(amountSol, maxTrade));
                }
            } else {
                llmReasoning = "Failed to parse JSON from LLM: " + responseText;
            }
        } catch (err: any) {
            console.error("LLM Generation Error:", err.message);
            llmReasoning = `Error querying Anthropic API: ${err.message}`;
        }

        console.log(`Decision: ${decision}\nReason: ${llmReasoning}`);

        // 2. Store the reasoning and decision
        await this.brain.store({
            type: 'procedural',
            content: `Signal received for ${signal.symbol} (${signal.tokenAddress}). Decision: ${decision}. Reasoning: ${llmReasoning}. Initial signal data: ${JSON.stringify(signal)}`,
            summary: `Trade decision for ${signal.symbol}`,
            tags: ['trade_decision', signal.symbol, decision],
            source: 'TradeAgent'
        });

        if (decision === 'BUY' && amountSol > 0) {
            await this.executeTrade(signal, amountSol);
        }
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
            console.error('Dream cycle skipped or failed (Anthropic config may be missing):', e.message);
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

        // 2. Get current price (Mocking price fetch for now or using DexScreener if we had symbol)
        // For simplicity, we'll try to fetch symbol/price from DexScreener
        const dexResp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        const dexData: any = await dexResp.json();
        const pair = dexData.pairs?.[0];
        const currentPrice = pair ? parseFloat(pair.priceUsd) : 0;
        const symbol = pair ? pair.baseToken.symbol : mint.slice(0, 4);

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
            const response = await this.anthropic.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 200,
                messages: [{ role: 'user', content: prompt }]
            });
            const responseText = (response.content[0] as any).text;
            const jsonMatch = responseText.match(/\{[\s\S]*?\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.decision === 'SELL' && parsed.amountToken > 0) {
                    const sellAmount = Math.min(parsed.amountToken, balance);
                    console.log(`Executing SELL for ${symbol}: ${sellAmount}`);
                    await this.executeSell(mint, symbol, sellAmount, parsed.reasoning);
                }
            }
        } catch (err: any) {
            console.error("Sell evaluation error:", err.message);
        }
    }

    private async executeSell(mint: string, symbol: string, amount: number, reasoning: string) {
        console.log(`Executing Jupiter swap for SELL ${symbol}...`);

        let txHash = "pending...";
        try {
            // 1. Get quote (Token -> SOL)
            const quoteResponse: any = await (
                await fetch(`https://public.jupiterapi.com/quote?inputMint=${mint}&outputMint=So11111111111111111111111111111111111111112&amount=${Math.floor(amount * 1e6)}&slippageBps=1000`)
            ).json(); // Note: amount needs to be in atoms. We'd need token decimals here.

            // For now, this is a simplified SELL execution. 
            // Real implementation would need to handle decimals correctly.

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
            txHash = `FAILED: ${e.message}`;
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
