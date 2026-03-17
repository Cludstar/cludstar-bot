import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { PumpAgent } from '@pump-fun/agent-payments-sdk';
import { BN } from '@coral-xyz/anchor';

export async function POST(req: NextRequest) {
    try {
        const { paymentParams } = await req.json();

        if (!paymentParams) {
            return NextResponse.json({ error: "Missing payment parameters" }, { status: 400 });
        }

        const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
        const connection = new Connection(rpcUrl);
        const AGENT_TOKEN = new PublicKey('2WVTfBD8ZfN4JwDFpfPvugWeJFy3FRC12Bw4QowFpump');

        const agent = new PumpAgent(AGENT_TOKEN, "mainnet", connection);

        const isValid = await agent.validateInvoicePayment({
            user: new PublicKey(paymentParams.user),
            currencyMint: new PublicKey(paymentParams.currencyMint),
            amount: Number(paymentParams.amount),
            memo: Number(paymentParams.memo),
            startTime: Number(paymentParams.startTime),
            endTime: Number(paymentParams.endTime)
        });

        if (isValid) {
            // Unlocked result!
            const randomNumber = Math.floor(Math.random() * 1001);
            return NextResponse.json({ success: true, result: randomNumber });
        } else {
            return NextResponse.json({ success: false, error: "Payment verification failed" }, { status: 402 });
        }

    } catch (error: any) {
        console.error("Verification error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
