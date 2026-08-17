-- Live Mixing / SCADA state additions for existing Pharma Process runtime tables.
-- Safe to run once against ees_data_platform / Pharma Process shared PostgreSQL database.
ALTER TABLE IF EXISTS mix_batches ADD COLUMN IF NOT EXISTS agitator_command_rpm INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS mix_batches ADD COLUMN IF NOT EXISTS motor_load_percent DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS mix_batches ADD COLUMN IF NOT EXISTS vacuum_bar DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS mix_batches ADD COLUMN IF NOT EXISTS vessel_closed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS mix_batches ADD COLUMN IF NOT EXISTS readiness_verified BOOLEAN NOT NULL DEFAULT FALSE;
