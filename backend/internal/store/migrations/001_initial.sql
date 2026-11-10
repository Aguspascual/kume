CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_normalized CHECK (email = lower(email) AND email = btrim(email))
);

CREATE TABLE auth_sessions (
    token_hash BYTEA PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT auth_sessions_token_hash_length CHECK (octet_length(token_hash) = 32)
);

CREATE INDEX auth_sessions_user_expiry_idx ON auth_sessions (user_id, expires_at);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);

CREATE TABLE user_data (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collection TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    payload JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, collection),
    CONSTRAINT user_data_supported_collection CHECK (
        collection IN ('clientes', 'presupuestos', 'trabajos', 'tiposTrabajo')
    ),
    CONSTRAINT user_data_array_payload CHECK (jsonb_typeof(payload) = 'array')
);
