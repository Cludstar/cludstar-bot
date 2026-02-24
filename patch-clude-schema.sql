CREATE TABLE IF NOT EXISTS entities (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    aliases TEXT[] DEFAULT '{}',
    description TEXT,
    metadata JSONB DEFAULT '{}',
    mention_count INTEGER DEFAULT 1,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    embedding vector(1024)
);

CREATE OR REPLACE FUNCTION batch_boost_memory_access(
    memory_ids BIGINT[],
    boost_amount FLOAT DEFAULT 0.05
)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE memories
    SET importance = LEAST(1.0, importance + boost_amount),
        access_count = access_count + 1,
        last_accessed = NOW()
    WHERE id = ANY(memory_ids);
END;
$$;
