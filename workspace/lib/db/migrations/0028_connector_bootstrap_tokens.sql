-- PHASE 8.1: Secure Connector Onboarding
-- Move token delivery to separate one-shot endpoint
-- Make connector_token_hash nullable during bootstrap

ALTER TABLE connectors
ALTER COLUMN connector_token_hash DROP NOT NULL;

CREATE TABLE connector_bootstrap_tokens (
  id              SERIAL PRIMARY KEY,
  connector_id    INTEGER NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMP NOT NULL,
  used_at         TIMESTAMP,
  delivered_at    TIMESTAMP,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMP
);

CREATE INDEX connector_bootstrap_tokens_connector_id_idx
  ON connector_bootstrap_tokens(connector_id);

CREATE UNIQUE INDEX connector_bootstrap_tokens_token_hash_idx
  ON connector_bootstrap_tokens(token_hash);

CREATE INDEX connector_bootstrap_tokens_expires_at_idx
  ON connector_bootstrap_tokens(expires_at);
