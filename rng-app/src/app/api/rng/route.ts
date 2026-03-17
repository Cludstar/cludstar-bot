import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        // Simple delay to simulate generation processing
        await new Promise(resolve => setTimeout(resolve, 800));

        // Generate a random number between 0 and 1000
        const rng = Math.floor(Math.random() * 1001);

        return NextResponse.json({ 
            success: true, 
            result: rng,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: 'Failed to generate number' },
            { status: 500 }
        );
    }
}
