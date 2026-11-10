CREATE TABLE access_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    source TEXT NOT NULL CHECK (source IN ('password', 'service_token', 'unknown')),
    result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
    ip_address INET,
    reason TEXT
);

CREATE INDEX access_events_time_id_idx ON access_events (occurred_at, event_id);
CREATE INDEX access_events_user_time_idx ON access_events (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE activity_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('auth', 'account', 'data', 'system')),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
    detail TEXT CHECK (detail IS NULL OR length(detail) <= 1000),
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'info'))
);

CREATE INDEX activity_events_time_id_idx ON activity_events (occurred_at, event_id);

CREATE TABLE monitoring_samples (
    observed_at TIMESTAMPTZ PRIMARY KEY,
    cpu_usage_percent DOUBLE PRECISION CHECK (cpu_usage_percent IS NULL OR cpu_usage_percent BETWEEN 0 AND 100),
    memory_used_bytes BIGINT CHECK (memory_used_bytes IS NULL OR memory_used_bytes >= 0),
    memory_total_bytes BIGINT CHECK (memory_total_bytes IS NULL OR memory_total_bytes >= 0),
    network_receive_bytes_per_second DOUBLE PRECISION CHECK (network_receive_bytes_per_second IS NULL OR network_receive_bytes_per_second >= 0),
    network_send_bytes_per_second DOUBLE PRECISION CHECK (network_send_bytes_per_second IS NULL OR network_send_bytes_per_second >= 0),
    active_sessions BIGINT CHECK (active_sessions IS NULL OR active_sessions >= 0)
);

CREATE TABLE monitoring_metadata (
    name TEXT PRIMARY KEY,
    value TIMESTAMPTZ NOT NULL
);

INSERT INTO monitoring_metadata (name, value) VALUES ('audit_started_at', now())
ON CONFLICT (name) DO NOTHING;
