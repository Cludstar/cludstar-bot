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
                // LEVEL 4 VETO: Anti-Instant Rug
                // If the token is so new it's not indexed, we block it to be safe.
                console.warn(`[RugCheck] Token not indexed yet (${response.status}). VETOING for safety.`);
                return { isSafe: false, risks: ["unindexed_token_risk"], score: 0 };
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
                        risks.push("Mutable Metadata");
                        // LEVEL 4 VETO: Mutable metadata on a token with an existing score is a hard no.
                        if (data.score > 400) {
                            isSafe = false;
                        }
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
