-- NetOps Co-pilot: sessions, messages, tool runs, entities, skills, feedback

CREATE TABLE IF NOT EXISTS copilot_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  anchor_device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS copilot_sessions_tenant_user_idx
  ON copilot_sessions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS copilot_sessions_updated_at_idx
  ON copilot_sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS copilot_messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES copilot_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS copilot_messages_session_id_idx
  ON copilot_messages(session_id);
CREATE INDEX IF NOT EXISTS copilot_messages_created_at_idx
  ON copilot_messages(created_at);

CREATE TABLE IF NOT EXISTS copilot_tool_runs (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES copilot_sessions(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES copilot_messages(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  input_json JSONB NOT NULL,
  output_json JSONB,
  status TEXT NOT NULL DEFAULT 'ok',
  duration_ms INTEGER,
  source_type TEXT,
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS copilot_tool_runs_session_id_idx
  ON copilot_tool_runs(session_id);
CREATE INDEX IF NOT EXISTS copilot_tool_runs_message_id_idx
  ON copilot_tool_runs(message_id);
CREATE INDEX IF NOT EXISTS copilot_tool_runs_tool_name_idx
  ON copilot_tool_runs(tool_name);

CREATE TABLE IF NOT EXISTS copilot_feedback (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES copilot_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS copilot_feedback_message_id_idx
  ON copilot_feedback(message_id);

CREATE TABLE IF NOT EXISTS copilot_entities (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  asn INTEGER,
  prefixes JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS copilot_entities_tenant_type_name_uq
  ON copilot_entities(tenant_id, entity_type, canonical_name);
CREATE INDEX IF NOT EXISTS copilot_entities_tenant_id_idx
  ON copilot_entities(tenant_id);

CREATE TABLE IF NOT EXISTS copilot_learned_aliases (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER REFERENCES copilot_entities(id) ON DELETE CASCADE,
  canonical_name TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS copilot_learned_aliases_tenant_alias_uq
  ON copilot_learned_aliases(tenant_id, alias);
CREATE INDEX IF NOT EXISTS copilot_learned_aliases_status_idx
  ON copilot_learned_aliases(status);

CREATE TABLE IF NOT EXISTS copilot_skills (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  intent_patterns JSONB DEFAULT '[]'::jsonb,
  tool_chain JSONB DEFAULT '[]'::jsonb,
  response_template TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS copilot_skills_tenant_skill_key_uq
  ON copilot_skills(tenant_id, skill_key);
CREATE INDEX IF NOT EXISTS copilot_skills_enabled_idx
  ON copilot_skills(enabled);

-- Seed global skills (tenant_id NULL = catalogo padrao)
INSERT INTO copilot_skills (tenant_id, skill_key, name, description, intent_patterns, tool_chain, enabled)
SELECT NULL, 'bgp_peering', 'BGP Peering', 'Consulta estado de sessoes BGP via SNMP em escopo da empresa',
       '["peering","peer","sessao bgp","cdn"]'::jsonb,
       '["copilot_entity_resolve","bgp_peer_status_query","route_policy_lookup"]'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM copilot_skills WHERE tenant_id IS NULL AND skill_key = 'bgp_peering');

INSERT INTO copilot_skills (tenant_id, skill_key, name, description, intent_patterns, tool_chain, enabled)
SELECT NULL, 'bgp_announcements', 'BGP Announcements', 'Consulta matriz de anuncios e elegibilidade de export',
       '["anuncio","prefixo","export","import"]'::jsonb,
       '["copilot_entity_resolve","announcement_matrix_query","bgp_peer_status_query"]'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM copilot_skills WHERE tenant_id IS NULL AND skill_key = 'bgp_announcements');

INSERT INTO copilot_skills (tenant_id, skill_key, name, description, intent_patterns, tool_chain, enabled)
SELECT NULL, 'l2_circuits', 'L2 Circuits', 'Consulta circuitos L2/VSI/PW e findings',
       '["circuito","l2","vsi","pw"]'::jsonb,
       '["copilot_entity_resolve","l2_circuit_status_query"]'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM copilot_skills WHERE tenant_id IS NULL AND skill_key = 'l2_circuits');

INSERT INTO copilot_skills (tenant_id, skill_key, name, description, intent_patterns, tool_chain, enabled)
SELECT NULL, 'config_guidance', 'Config Guidance', 'Dicas read-only de configuracao sem apply',
       '["como configur","template","route-policy"]'::jsonb,
       '["copilot_entity_resolve","bgp_peer_status_query","config_suggestion_builder"]'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM copilot_skills WHERE tenant_id IS NULL AND skill_key = 'config_guidance');

-- Seed known CDN/provider entities for each active tenant
INSERT INTO copilot_entities (tenant_id, entity_type, canonical_name, aliases, asn, metadata)
SELECT t.id, 'cdn', 'Google', '["google","ggc","google cache","googlecdn","as15169","15169"]'::jsonb, 15169, '{"vrf":"CDN"}'::jsonb
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, entity_type, canonical_name) DO NOTHING;

INSERT INTO copilot_entities (tenant_id, entity_type, canonical_name, aliases, asn, metadata)
SELECT t.id, 'cdn', 'Meta/Facebook', '["meta","facebook","fb","as32934"]'::jsonb, 32934, '{"vrf":"CDN"}'::jsonb
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, entity_type, canonical_name) DO NOTHING;

INSERT INTO copilot_entities (tenant_id, entity_type, canonical_name, aliases, asn, metadata)
SELECT t.id, 'cdn', 'Netflix', '["netflix","nflx","as2906"]'::jsonb, 2906, '{"vrf":"CDN"}'::jsonb
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, entity_type, canonical_name) DO NOTHING;

INSERT INTO copilot_entities (tenant_id, entity_type, canonical_name, aliases, asn, metadata)
SELECT t.id, 'cdn', 'Akamai', '["akamai","as20940"]'::jsonb, 20940, '{"vrf":"CDN"}'::jsonb
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, entity_type, canonical_name) DO NOTHING;

INSERT INTO copilot_entities (tenant_id, entity_type, canonical_name, aliases, asn, metadata)
SELECT t.id, 'cdn', 'Cloudflare', '["cloudflare","as13335"]'::jsonb, 13335, '{"vrf":"CDN"}'::jsonb
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, entity_type, canonical_name) DO NOTHING;

INSERT INTO copilot_entities (tenant_id, entity_type, canonical_name, aliases, asn, metadata)
SELECT t.id, 'provider', 'Vivo', '["vivo","telefonica brasil"]'::jsonb, NULL, '{}'::jsonb
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, entity_type, canonical_name) DO NOTHING;

INSERT INTO copilot_entities (tenant_id, entity_type, canonical_name, aliases, asn, metadata)
SELECT t.id, 'provider', 'TIM', '["tim","telecom italia"]'::jsonb, NULL, '{}'::jsonb
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, entity_type, canonical_name) DO NOTHING;

INSERT INTO copilot_entities (tenant_id, entity_type, canonical_name, aliases, asn, metadata)
SELECT t.id, 'ix', 'IX.br', '["ix","ix.br","ptt","ptt-sp"]'::jsonb, NULL, '{}'::jsonb
FROM tenants t
WHERE t.status = 'active'
ON CONFLICT (tenant_id, entity_type, canonical_name) DO NOTHING;
