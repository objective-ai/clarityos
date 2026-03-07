-- Migration: Add user_id column to staff table
-- Links staff records to Supabase Auth users for identity resolution.
--
-- Run in: Supabase Dashboard -> SQL Editor

ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE;
CREATE INDEX IF NOT EXISTS ix_staff_user_id ON staff (user_id);
