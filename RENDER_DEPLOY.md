## Deploying to Render

Now that your code is on GitHub, deploying to Render as a Web Service is straightforward.

### Step 1: Configure Secret Files
For maximum security, sensitive keys like your wallet's private key should NOT be stored in environment variables.

1. Go to your **Render Dashboard**, select your service.
2. Go to **Environment**, then scroll to **Secret Files**.
3. Click **Add Secret File**:
   - **Filename:** `wallet.txt`
   - **Contents:** Paste your **NEW** wallet's base58 private key string here.
4. Click **Save**.

### Step 2: Configure Environment Variables
Now, add the non-sensitive configuration:
1. Go to **Environment Variables**.
2. **DELETE** any existing `BOT_PRIVATE_KEY` entry (It is now a secret file).
3. Add/Update the following:
   - `BOT_PRIVATE_KEY_PATH` : `/etc/secrets/wallet.txt`
   - `RPC_URL` : Your Solana RPC URL.
   - `HELIUS_RPC_URL` : Your Helius RPC URL.
   - `SUPABASE_URL` : Your Supabase Project URL.
   - `SUPABASE_SERVICE_KEY` : Your **NEW** Supabase Secret Key.
   - `GEMINI_API_KEY` : Your Google Gemini API Key.
   - `NODE_ENV` : `production`

### Step 2: Deployment Settings
- **Runtime:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
