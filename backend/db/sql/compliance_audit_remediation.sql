-- compliance_audit_remediation.sql
-- Remediates CRIT-001 and CRIT-002 from the 2026-03-06 compliance audit.
-- Run against each tenant schema (e.g. SET search_path TO clinic_sunview).

-- CRIT-001: Add recorded_by_id to diagnoses table
ALTER TABLE diagnoses
    ADD COLUMN IF NOT EXISTS recorded_by_id UUID
        REFERENCES staff(id) ON DELETE SET NULL;

-- CRIT-002: Add soft-delete columns to superbill_line_items table
ALTER TABLE superbill_line_items
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
