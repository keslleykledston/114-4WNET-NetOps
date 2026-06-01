-- v0.9.3 Resource Manager tables

CREATE TABLE IF NOT EXISTS resource_pools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL,
  vendor TEXT,
  tenant_id INTEGER REFERENCES tenants(id),
  site_id INTEGER,
  range_start INTEGER NOT NULL,
  range_end INTEGER NOT NULL,
  metadata_json JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_range CHECK (range_start <= range_end)
);

CREATE TABLE IF NOT EXISTS resource_allocations (
  id SERIAL PRIMARY KEY,
  resource_pool_id INTEGER NOT NULL REFERENCES resource_pools(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_value INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ALLOCATED', 'RESERVED', 'RELEASED')),
  device_id INTEGER REFERENCES devices(id),
  service_request_id INTEGER REFERENCES service_requests(id),
  allocated_by TEXT NOT NULL,
  allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP,
  UNIQUE(resource_pool_id, resource_value)
);

CREATE TABLE IF NOT EXISTS resource_reservations (
  id SERIAL PRIMARY KEY,
  resource_pool_id INTEGER NOT NULL REFERENCES resource_pools(id) ON DELETE CASCADE,
  resource_value INTEGER NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_resource_allocations_pool ON resource_allocations(resource_pool_id);
CREATE INDEX idx_resource_allocations_status ON resource_allocations(status);
CREATE INDEX idx_resource_allocations_device ON resource_allocations(device_id);
CREATE INDEX idx_resource_allocations_service ON resource_allocations(service_request_id);
CREATE INDEX idx_resource_reservations_pool ON resource_reservations(resource_pool_id);
CREATE INDEX idx_resource_reservations_expires ON resource_reservations(expires_at);
