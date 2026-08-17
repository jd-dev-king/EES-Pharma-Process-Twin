-- Pharma Process campaign / PAS-X / premix execution extension
-- Run against the Pharma Process runtime tables in the shared PostgreSQL ees_data_platform database.

ALTER TABLE IF EXISTS weigh_ticket_lines ADD COLUMN IF NOT EXISTS scale_type varchar(40) NOT NULL DEFAULT 'Bench Scale';
ALTER TABLE IF EXISTS weigh_ticket_lines ADD COLUMN IF NOT EXISTS container_id varchar(80);
ALTER TABLE IF EXISTS weigh_ticket_lines ADD COLUMN IF NOT EXISTS tare_weight double precision NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS weigh_ticket_lines ADD COLUMN IF NOT EXISTS gross_weight double precision;

ALTER TABLE IF EXISTS premix_runs ADD COLUMN IF NOT EXISTS premix_water_kg double precision NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS premix_runs ADD COLUMN IF NOT EXISTS rinse_water_kg double precision NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS production_campaigns (
    id serial PRIMARY KEY,
    campaign_id varchar(60) UNIQUE NOT NULL,
    material_number varchar(50) NOT NULL,
    po_numbers text NOT NULL,
    status varchar(40) NOT NULL DEFAULT 'Active',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_production_campaigns_campaign_id ON production_campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS ix_production_campaigns_material_number ON production_campaigns(material_number);

-- MES extension for campaign, scale, container and cleaning events remains event-based in mes.execution_events.
ALTER TABLE IF EXISTS cip_runs ADD COLUMN IF NOT EXISTS cleaning_type varchar(40) NOT NULL DEFAULT 'Full CIP';
ALTER TABLE IF EXISTS rnd_sample_batches ADD COLUMN IF NOT EXISTS lab_stage varchar(50) NOT NULL DEFAULT 'R&D Material Request';
ALTER TABLE IF EXISTS rnd_sample_batches ADD COLUMN IF NOT EXISTS agitation_rpm integer NOT NULL DEFAULT 120;
ALTER TABLE IF EXISTS rnd_sample_batches ADD COLUMN IF NOT EXISTS agitation_minutes integer NOT NULL DEFAULT 10;
