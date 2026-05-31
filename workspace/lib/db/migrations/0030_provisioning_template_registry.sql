-- Provisioning Template Registry (v0.8.1)
-- Introduces: provisioning_templates, provisioning_template_versions, provisioning_template_audit_logs
-- These tables support read-only template versioning, status tracking, and audit logging

CREATE TABLE provisioning_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  service_type TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  source TEXT NOT NULL DEFAULT 'db',
  variables_json TEXT,
  validation_rules_json TEXT,
  template_body TEXT,
  description TEXT,
  created_by TEXT,
  approved_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(name, vendor, service_type)
);

CREATE TABLE provisioning_template_versions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES provisioning_templates(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  template_body TEXT,
  variables_json TEXT,
  validation_rules_json TEXT,
  changed_by TEXT,
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE provisioning_template_audit_logs (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES provisioning_templates(id) ON DELETE SET NULL,
  actor TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX provisioning_templates_vendor_idx ON provisioning_templates(vendor);
CREATE INDEX provisioning_templates_status_idx ON provisioning_templates(status);
CREATE INDEX provisioning_template_versions_template_id_idx ON provisioning_template_versions(template_id);
CREATE INDEX provisioning_template_audit_logs_template_id_idx ON provisioning_template_audit_logs(template_id);
