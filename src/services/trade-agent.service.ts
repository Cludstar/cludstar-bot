import { Cortex } from 'clude-bot';
import Anthropic from '@anthropic-ai/sdk';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';

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

        // 1. Recall past memories related to tokens like this
        const memories = await this.brain.recall({
            query: `successful trades similar to ${signal.symbol} with high volume`,
            limit: 5,
        });

        const context = this.brain.formatContext(memories);

        // Make an LLM call using the context to decide whether to Buy or Skip.
        const prompt = `You are an autonomous Solana trading agent.
Your goal is to grow the portfolio from 1 SOL to 100 SOL.
Here is the new incoming signal data:
${JSON.stringify(signal)}

Here are some relevant past trading memories:
${context}

Based on this information, should you BUY or SKIP this token?
Respond with a JSON object in this exact format:
{
  "decision": "BUY" | "SKIP",
  "reasoning": "A concise 1-sentence explanation of your decision based on the patterns"
}`;

        console.log("Consulting Claude 3 Haiku for decision...");
        let decision = "SKIP";
        let llmReasoning = "Default Fallback";

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

        if (decision === 'BUY') {
            await this.executeTrade(signal);
        }
    }

    private async executeTrade(signal: TradeSignal) {
        console.log(`Executing Jupiter swap for ${signal.symbol}...`);

        let txHash = "pending...";
        try {
            // Amount to buy per trade (e.g. 0.005 SOL just to be safe during live automation testing)
            const amountLamports = 5000000;

            // 1. Fetch quote from Jupiter V6
            const quoteResponse = await (
                await fetch(`https://public.jupiterapi.com/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${signal.tokenAddress}&amount=${amountLamports}&slippageBps=50`)
            ).json();

            if (quoteResponse.error) {
                throw new Error(`Jupiter Quote Error: ${quoteResponse.error}`);
            }

            // 2. Fetch serialized swap transaction from Jupiter
            const { swapTransaction } = await (
                await fetch('https://public.jupiterapi.com/swap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: this.wallet.publicKey.toString(),
                        wrapAndUnwrapSol: true,
                        dynamicComputeUnitLimit: true,
                        prioritizationFeeLamports: "auto"
                    })
                })
            ).json();

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
            txHash = `FAILED_TX_${Date.now()}`;
        }

        // Store trade success/failure with the TX Hash in Clude
        await this.brain.store({
            type: 'episodic',
            content: `Attempted to buy ${signal.symbol}. Real Jupiter Swap TX Hash: ${txHash}.`,
            summary: `Jupiter BUY on ${signal.symbol} (TX: ${txHash.slice(0, 8)}...)`,
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
}
