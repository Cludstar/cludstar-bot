import fetch from 'node-fetch';

export interface RugCheckResult {
    isSafe: boolean;
    risks: string[];
    score: number;
}

export class RugCheckService {

    /**
     * Queries the public RugCheck.xyz API for a token summary.
     * Returns true if the token is relatively safe to trade.
     */
    async isTokenSafe(mintAddress: string): Promise<RugCheckResult> {
        console.log(`[RugCheck] Scanning contract: ${mintAddress}...`);

        try {
            const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report/summary`);

            if (!response.ok) {
                // If API is down or token not found, we err on the side of caution or allow it based on risk tolerance.
                // For a de-gen bot, if rugcheck doesn't know it yet, it might just be VERY new.
                console.warn(`[RugCheck] API unavailable or token not indexed yet (${response.status}). Proceeding with caution.`);
                return { isSafe: true, risks: ["unindexed_token"], score: 0 };
            }

            const data: any = await response.json();

            // Look through the risks array returned by RugCheck
            const risks: string[] = [];
            let isSafe = true;

            if (data.risks && Array.isArray(data.risks)) {
                for (const risk of data.risks) {
                    // Check for absolute dealbreakers
                    if (risk.name === "Freeze Authority still enabled") {
                        risks.push("Freeze Authority Enabled");
                        isSafe = false;
                    }
                    if (risk.name === "Mint Authority still enabled") {
                        risks.push("Mint Authority Enabled");
                        isSafe = false;
                    }
                    // High concentration warning
                    if (risk.name.includes("Top 10 holders") && risk.score > 500) {
                        // Some rugchecks assign very high scores to centralization
                        risks.push("High Top 10 Concentration");
                        // Assuming a score > 500 for concentration is a hard no for our bot
                        isSafe = false;
                    }
                    if (risk.name === "Mutable Metadata") {
                        // Moderately dangerous, but very common on new memes. We note it but don't strictly block.
                        risks.push("Mutable Metadata");
                    }
                }
            }

            const totalScore = data.score || 0;
            // RugCheck score: lower is better. > 1000 is usually considered "Danger"
            if (totalScore > 1000) {
                isSafe = false;
                risks.push(`High Danger Score: ${totalScore}`);
            }

            return {
                isSafe,
                risks,
                score: totalScore
            };

        } catch (error: any) {
            console.error(`[RugCheck] Error querying API: ${error.message}`);
            // Fallback: allow the trade to proceed but flag the error
            return { isSafe: true, risks: ["api_error"], score: 0 };
        }
    }
}
