-- Template Studio v0.8.2
-- Drafts, validation, and compiler logs for template creation

CREATE TABLE template_drafts (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES provisioning_templates(id) ON DELETE SET NULL,
  version TEXT NOT NULL DEFAULT '0.0.1',
  draft_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_by TEXT NOT NULL,
  approved_by TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE template_validation_results (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL REFERENCES template_drafts(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  errors_json TEXT,
  warnings_json TEXT,
  validated_by TEXT,
  validated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE template_compiler_logs (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER REFERENCES template_drafts(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  input_dsl TEXT,
  output_cli TEXT,
  errors_json TEXT,
  actor TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX template_drafts_status_idx ON template_drafts(status);
CREATE INDEX template_drafts_created_by_idx ON template_drafts(created_by);
CREATE INDEX template_validation_results_draft_id_idx ON template_validation_results(draft_id);
CREATE INDEX template_compiler_logs_draft_id_idx ON template_compiler_logs(draft_id);
