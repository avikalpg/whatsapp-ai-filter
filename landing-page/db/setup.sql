CREATE TABLE IF NOT EXISTS analytics (
    -- Unique identifier for each analytics record (each daily/periodic report)
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Unique, anonymous identifier for the bot installation
    installation_id UUID NOT NULL,

    -- Timestamp when this analytics record was created/recorded (UTC time)
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Bot details
    app_version VARCHAR(50),
    node_version VARCHAR(20),
    os_platform VARCHAR(50),
    is_running_with_pm2 BOOLEAN,
    uptime_seconds_since_last_heartbeat INTEGER,

    -- Core filtering metrics
    messages_analyzed_count INTEGER NOT NULL DEFAULT 0,
    messages_relevant_count INTEGER NOT NULL DEFAULT 0,

    -- Counts of messages processed by each AI provider (e.g., {"perplexity": 100, "openai": 50})
    ai_provider_message_counts JSONB DEFAULT '{}'::jsonb,

    -- Average processing latency per AI provider (e.g., {"perplexity": 150.23, "openai": 200.50})
    ai_api_latency_ms JSONB DEFAULT '{}'::jsonb,

    -- Number of successful API calls per AI provider (e.g., {"perplexity": 100, "openai": 98})
    ai_api_success_counts JSONB DEFAULT '{}'::jsonb,

    -- Number of failed API calls per AI provider (e.g., {"perplexity": 0, "openai": 2})
    ai_api_failure_counts JSONB DEFAULT '{}'::jsonb
);

-- Recommended Indexes for faster querying:
CREATE INDEX idx_analytics_installation_id ON analytics (installation_id);
CREATE INDEX idx_analytics_recorded_at ON analytics (recorded_at DESC);