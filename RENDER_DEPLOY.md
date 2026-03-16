## Deploying to Render

Now that your code is on GitHub, deploying to Render as a Web Service is straightforward.

### Step 1: Configure Environment Variables
Render needs all the secrets from your local `.env` file to run the bot.
1. Go to your **Render Dashboard**, select your service.
2. Go to **Environment Variables**.
3. Use the **Secret File** or **Add Environment Variable** to add:
   - `RPC_URL` : Your Solana RPC URL.
   - `HELIUS_RPC_URL` : Your Helius RPC URL.
   - `BOT_PRIVATE_KEY` : Your wallet private key.
   - `SUPABASE_URL` : Your Supabase Project URL.
   - `SUPABASE_SERVICE_KEY` : Your **NEW** Supabase Secret Key (The old one was revoked).
   - `GEMINI_API_KEY` : Your Google Gemini API Key.

### Step 2: Deployment Settings
- **Runtime:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
