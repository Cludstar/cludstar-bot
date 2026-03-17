import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { PumpAgent } from '@pump-fun/agent-payments-sdk';
import { BN } from '@coral-xyz/anchor';

export async function POST(req: NextRequest) {
    try {
        const { userWallet } = await req.json();

        if (!userWallet) {
            return NextResponse.json({ error: "Missing user wallet address" }, { status: 400 });
        }

        const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
        const connection = new Connection(rpcUrl);
        const userPubKey = new PublicKey(userWallet);
        const AGENT_TOKEN = new PublicKey('2WVTfBD8ZfN4JwDFpfPvugWeJFy3FRC12Bw4QowFpump');

        // SDK initialization
        const agent = new PumpAgent(AGENT_TOKEN, "mainnet", connection);

        // Parameters for the payment
        const amount = 0; // 0.00 SOL
        const memo = Math.floor(Math.random() * 1000000);
        const startTime = Math.floor(Date.now() / 1000);
        const endTime = startTime + 3600; // 1 hour window

        // Build instructions
        const instructions = await agent.buildAcceptPaymentInstructions({
            user: userPubKey,
            currencyMint: NATIVE_MINT,
            amount,
            memo,
            startTime,
            endTime
        });

        // Create transaction
        const transaction = new Transaction().add(...instructions);
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userPubKey;

        // Serialize the transaction
        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return NextResponse.json({
            transaction: serializedTransaction,
            paymentParams: {
                user: userWallet,
                currencyMint: NATIVE_MINT.toBase58(),
                amount: amount.toString(),
                memo: memo.toString(),
                startTime: startTime.toString(),
                endTime: endTime.toString()
            }
        });

    } catch (error: any) {
        console.error("Invoice generation error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
