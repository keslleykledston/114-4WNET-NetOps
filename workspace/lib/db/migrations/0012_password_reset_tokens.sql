-- Create user_password_reset_tokens table
-- Enables temporary tokens for email-based password reset flow (v0.3.0)

CREATE TABLE user_password_reset_tokens (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX user_password_reset_tokens_token_hash_uq ON user_password_reset_tokens(token_hash);
CREATE INDEX user_password_reset_tokens_user_id_idx ON user_password_reset_tokens(user_id);
CREATE INDEX user_password_reset_tokens_expires_at_idx ON user_password_reset_tokens(expires_at);
