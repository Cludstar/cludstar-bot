## Deploying to Render

Now that your code is on GitHub, deploying to Render as a Web Service is straightforward. The application requires a background process to run the trading loop and an Express server to host the Command Center UI.

### Step 1: Add a build script (Optional but recommended)
We are currently using `ts-node` to run the bot directly from TypeScript. Render prefers compiled JavaScript for production.
I have updated your `package.json` to include a build step.

### Step 2: Create a Render Web Service
1. Go to your [Render Dashboard](https://dashboard.render.com/) and click **New** -> **Web Service**.
2. Connect your GitHub account and select the `Cludstar/cludstar-bot` repository.
3. Fill out the service details:
   - **Name:** `cludstar-bot` (or whatever you prefer)
   - **Region:** Choose the region closest to you.
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Choose the Instance Type (Free tier works, but Starter is better for consistent uptime as the free tier spins down after 15 minutes of inactivity).

### Step 3: Configure Environment Variables
Render needs all the secrets from your local `.env` file to run the bot.
1. Scroll down to the **Environment Variables** section on the Render setup page.
2. Click **Add Environment Variable** and add the following keys with the values from your local `.env` file:
   - `RPC_URL` : `https://staging.oobeprotocol.ai:8080/rpc?api_key=REDACTED_OOBE_KEY`
   - `BOT_PRIVATE_KEY` : The Base58 private key from your `.env` file.
   - `SUPABASE_URL` : `https://jevjphhathwbfxaytmqw.supabase.co`
   - `SUPABASE_SERVICE_KEY` : `REDACTED_SUPABASE_KEY`
   - `ANTHROPIC_API_KEY` : `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`

### Step 4: Deploy!
Click **Create Web Service**. Render will automatically clone your repo, install dependencies, compile the TypeScript, and start the bot. 
Once deployed, Render will provide you with a `.onrender.com` URL where you can view your live Command Center dashboard!
