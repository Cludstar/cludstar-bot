import { Cortex } from './src/engine';
import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

async function forceDream() {
  console.log("Connecting to Supabase...");
  // Initialize minimal cortex just to run the dream cycle
  const brain = new Cortex({
      supabase: {
        url: process.env.SUPABASE_URL!,
        serviceKey: process.env.SUPABASE_SERVICE_KEY!
      },
      gemini: { 
        apiKey: process.env.GEMINI_API_KEY! 
      },
  });
  
  console.log("Brain initialized. Forcing a manual Dream Cycle...");
  
  try {
      await brain.init();
      await brain.dream();
      console.log("Dream Cycle complete! Check your dashboard logs.");
  } catch (err: any) {
      console.error("Dream Cycle failed:", err.message);
  }
}

forceDream().then(() => process.exit(0));
