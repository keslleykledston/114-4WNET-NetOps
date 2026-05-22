-- 0008_compliance_policy_profiles.sql
-- Create compliance_policy_profiles table for policy configuration

CREATE TABLE IF NOT EXISTS compliance_policy_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  device_role TEXT,
  vendor TEXT,
  platform TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rules_json JSONB NOT NULL DEFAULT '{}',
  thresholds_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add operational_category column to compliance_findings if not exists
ALTER TABLE compliance_findings
ADD COLUMN IF NOT EXISTS operational_category TEXT;

-- Insert default profiles
INSERT INTO compliance_policy_profiles (name, description, device_role, vendor, platform, rules_json, thresholds_json)
VALUES
  (
    'huawei-vrp-edge-strict',
    'Strict policy for critical edge devices (carrier-grade)',
    'edge',
    'huawei',
    'vrp',
    '{}',
    '{
      "bgp": {
        "peer_established_severity": "high",
        "customer_import_policy_severity": "high",
        "provider_export_policy_severity": "high",
        "prefix_list_severity": "high",
        "community_list_severity": "medium"
      },
      "interface": {
        "description_severity": "medium",
        "dot1q_severity": "info"
      },
      "security": {
        "telnet_severity": "high",
        "snmp_public_severity": "high"
      }
    }'
  ),
  (
    'huawei-vrp-edge-balanced',
    'Balanced policy for typical operational devices (DEFAULT)',
    'edge',
    'huawei',
    'vrp',
    '{}',
    '{
      "bgp": {
        "peer_established_severity": "medium",
        "customer_import_policy_severity": "medium",
        "provider_export_policy_severity": "medium",
        "prefix_list_severity": "medium",
        "community_list_severity": "medium"
      },
      "interface": {
        "description_severity": "low",
        "dot1q_severity": "info"
      },
      "security": {
        "telnet_severity": "medium",
        "snmp_public_severity": "info"
      }
    }'
  ),
  (
    'huawei-vrp-observe-only',
    'Observation-only profile, no blocking findings (good for onboarding)',
    'edge',
    'huawei',
    'vrp',
    '{}',
    '{
      "bgp": {
        "peer_established_severity": "info",
        "customer_import_policy_severity": "info",
        "provider_export_policy_severity": "info",
        "prefix_list_severity": "info",
        "community_list_severity": "info"
      },
      "interface": {
        "description_severity": "info",
        "dot1q_severity": "info"
      },
      "security": {
        "telnet_severity": "info",
        "snmp_public_severity": "info"
      }
    }'
  )
ON CONFLICT (name) DO NOTHING;

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_compliance_policy_profiles_name ON compliance_policy_profiles(name);
CREATE INDEX IF NOT EXISTS idx_compliance_policy_profiles_device_role ON compliance_policy_profiles(device_role);
