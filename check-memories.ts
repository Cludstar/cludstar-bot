import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMemories() {
    console.log("Checking memories table...");
    const { data, count, error } = await supabase
        .from('memories')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching memories:", error);
        return;
    }

    console.log(`Total memories found (estimating from recent): ${count}`);
    if (data && data.length > 0) {
        console.log("Most recent memories:");
        data.forEach(m => {
            console.log(`- [${m.created_at}] [${m.memory_type}] ${m.summary}`);
        });
    } else {
        console.log("No memories found in the table.");
    }
}

checkMemories();
