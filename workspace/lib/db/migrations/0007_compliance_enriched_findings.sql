ALTER TABLE compliance_findings
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS recommendation text,
  ADD COLUMN IF NOT EXISTS blocking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS object_type text,
  ADD COLUMN IF NOT EXISTS object_id text,
  ADD COLUMN IF NOT EXISTS object_name text,
  ADD COLUMN IF NOT EXISTS rule_id text,
  ADD COLUMN IF NOT EXISTS rule_name text,
  ADD COLUMN IF NOT EXISTS raw_reference text,
  ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS compliance_findings_job_id_idx ON compliance_findings(job_id);
CREATE INDEX IF NOT EXISTS compliance_findings_status_idx ON compliance_findings(status);
CREATE INDEX IF NOT EXISTS compliance_findings_severity_idx ON compliance_findings(severity);
CREATE INDEX IF NOT EXISTS compliance_findings_context_idx ON compliance_findings(context);
CREATE INDEX IF NOT EXISTS compliance_findings_confidence_idx ON compliance_findings(confidence);
CREATE INDEX IF NOT EXISTS compliance_findings_source_idx ON compliance_findings(source);
