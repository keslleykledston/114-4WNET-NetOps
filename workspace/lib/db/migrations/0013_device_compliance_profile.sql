-- Add compliance profile field to devices table
ALTER TABLE devices
ADD COLUMN compliance_profile_name text DEFAULT NULL;

-- Create index for faster lookups
CREATE INDEX idx_devices_compliance_profile ON devices(compliance_profile_name);

-- Update comment
COMMENT ON COLUMN devices.compliance_profile_name IS 'Compliance profile name assigned to this device (edge-balanced, access-balanced, observe-only, etc)';
