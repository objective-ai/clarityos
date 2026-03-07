-- Phase 7: Patient Intake — Schema Migration
-- Run against each tenant schema (e.g., clinic_sunview)

-- 1. Create intake_tokens table
CREATE TABLE IF NOT EXISTS intake_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    token           VARCHAR(64) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at      TIMESTAMPTZ NOT NULL,
    submitted_at    TIMESTAMPTZ,
    dob_attempts    INTEGER NOT NULL DEFAULT 0,
    dob_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    intake_data_jsonb   JSONB,
    triage_flags_jsonb  JSONB,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_intake_tokens_token ON intake_tokens(token);
CREATE INDEX IF NOT EXISTS ix_intake_tokens_appointment ON intake_tokens(appointment_id);
CREATE INDEX IF NOT EXISTS ix_intake_tokens_tenant_id ON intake_tokens(tenant_id);

-- 2. Add intake columns to appointments (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'appointments' AND column_name = 'intake_status'
    ) THEN
        ALTER TABLE appointments ADD COLUMN intake_status VARCHAR(20);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'appointments' AND column_name = 'triage_flags_jsonb'
    ) THEN
        ALTER TABLE appointments ADD COLUMN triage_flags_jsonb JSONB;
    END IF;
END $$;
