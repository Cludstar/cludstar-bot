const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkMemories() {
    const { data, error } = await supabase
        .from('memories')
        .select('created_at, memory_type, summary, content, tags')
        .in('memory_type', ['episodic', 'procedural'])
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching memories:", error);
    } else {
        data.forEach(m => {
            console.log(`[${new Date(m.created_at).toLocaleTimeString()}] [${(m.memory_type || 'UNKNOWN').toUpperCase()}] ${m.summary}`);
            console.log(`   -> ${String(m.content).slice(0, 150)}...`);
            console.log(`   -> Tags: ${m.tags?.join(', ')}`);
            console.log('---');
        });
    }
}

checkMemories();
