import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function analyzeMemories() {
    console.log("Analyzing memory distribution...");
    const { data: recent } = await supabase
        .from('memories')
        .select('memory_type, tags, summary')
        .order('created_at', { ascending: false })
        .limit(100);

    const stats = {
        total: recent?.length || 0,
        types: {} as any,
        trade_related: 0,
        system_related: 0
    };

    recent?.forEach(m => {
        stats.types[m.memory_type] = (stats.types[m.memory_type] || 0) + 1;
        const isTrade = (m.tags || []).some((t: string) => t.includes('trade_'));
        if (isTrade) stats.trade_related++;
        else stats.system_related++;
    });

    console.log("Stats (Recent 100):", JSON.stringify(stats, null, 2));
    
    if (stats.system_related === 0) {
        console.log("No non-trade memories in the last 100 entries.");
        const { data: system } = await supabase
            .from('memories')
            .select('summary, created_at, tags')
            .not('tags', 'cs', '{"trade_decision"}')
            .not('tags', 'cs', '{"trade_execution"}')
            .limit(5);
        
        console.log("Earliest system memories found:", system);
    }
}

analyzeMemories();
