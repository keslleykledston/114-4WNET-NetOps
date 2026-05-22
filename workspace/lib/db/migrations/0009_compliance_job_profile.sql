-- 0009_compliance_job_profile.sql
-- Add policy_profile_name to compliance_jobs

ALTER TABLE compliance_jobs
ADD COLUMN IF NOT EXISTS policy_profile_name TEXT DEFAULT 'huawei-vrp-edge-balanced';
