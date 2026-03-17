import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function run() {
  const { data } = await db
      .from('memories')
      .select('content, tags')
      .eq('memory_type', 'procedural')
      .contains('tags', ['rug_veto'])
      .order('created_at', { ascending: false })
      .limit(5);

  if (data && data.length > 0) {
      console.log("Recent VETO'd tokens:");
      for (const row of data) {
         console.log(row.content);
         // Extract mint from something like "Signal rejected for UAGENT due to severe contract risks..."
         // Actually, if we look at trade-agent.service.ts line 51:
         // tags: ['trade_decision', signal.symbol, 'SKIP', 'rug_veto']
         // So the mint is not in the tags.
      }
  }
}

run().then(() => process.exit(0));
