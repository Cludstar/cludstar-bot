import fetch from 'node-fetch';
import { RugCheckService } from './src/services/rugcheck.service';

async function run() {
    console.log("Fetching a new Solana token from DexScreener...");
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const profiles = await res.json();
    
    if (profiles && Array.isArray(profiles)) {
        const testCoin = profiles.find((p: any) => p.chainId === 'solana' && p.tokenAddress);
        if (testCoin) {
            console.log(`Testing RugCheck for new token: ${testCoin.url} (${testCoin.tokenAddress})`);
            
            const rugCheck = new RugCheckService();
            const result = await rugCheck.isTokenSafe(testCoin.tokenAddress);
            console.log("RugCheck Result:", JSON.stringify(result, null, 2));

            // Fetch raw API response to see why the score is so high
            const rawRes = await fetch(`https://api.rugcheck.xyz/v1/tokens/${testCoin.tokenAddress}/report/summary`);
            const rawData: any = await rawRes.json();
            console.log("Raw API Score:", rawData.score);
            console.log("Raw API Risks:", JSON.stringify(rawData.risks, null, 2));
        } else {
             console.log("No new solana token found");
        }
    }
}

run();
