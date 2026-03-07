-- Migration: Create audit_log table for HIPAA compliance logging
-- Run in: Supabase Dashboard -> SQL Editor

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    encounter_id UUID,
    patient_id UUID,
    detail TEXT,
    changes JSONB,
    metadata JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_log_tenant ON audit_log (tenant_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_resource ON audit_log (tenant_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_patient ON audit_log (tenant_id, patient_id, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_log_user ON audit_log (tenant_id, user_id, created_at);

-- Grant access to supabase_auth_admin if needed (probably not for audit_log)
-- GRANT SELECT ON audit_log TO authenticated;
