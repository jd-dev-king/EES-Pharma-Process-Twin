BEGIN;

CREATE SCHEMA IF NOT EXISTS mes;

CREATE TABLE IF NOT EXISTS mes.formulation_master (
    material_number varchar(40) PRIMARY KEY,
    formula_name varchar(180) NOT NULL,
    product_name varchar(200) NOT NULL DEFAULT 'Liquid Prednisone 15 mg/5 mL',
    flavor varchar(80) NOT NULL,
    dyes jsonb NOT NULL DEFAULT '[]'::jsonb,
    status varchar(30) NOT NULL DEFAULT 'approved',
    approved_by varchar(120) NOT NULL DEFAULT 'R&D / Quality',
    approved_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO mes.formulation_master(material_number,formula_name,flavor,dyes,status)
VALUES
('PDFC-0813','Cherry Dye Free','Cherry','[]'::jsonb,'approved'),
('PC-1308','Cherry with Dye Red 33 and Red 40','Cherry','["FD&C Red No. 33","FD&C Red No. 40"]'::jsonb,'approved'),
('PDFS-0914','Strawberry Dye Free','Strawberry','[]'::jsonb,'approved'),
('PS-1409','Strawberry with Dye Red 33 and Yellow 5','Strawberry','["FD&C Red No. 33","FD&C Yellow No. 5"]'::jsonb,'approved'),
('PDFG-0715','Grape Dye Free','Grape','[]'::jsonb,'approved'),
('PG-1507','Grape with Dye Blue 1 and Red 40','Grape','["FD&C Blue No. 1","FD&C Red No. 40"]'::jsonb,'approved'),
('PDFB-0616','Berry Dye Free','Berry','[]'::jsonb,'approved'),
('PB-1606','Berry with Dye Red 40','Berry','["FD&C Red No. 40"]'::jsonb,'approved')
ON CONFLICT (material_number) DO UPDATE SET
 formula_name=EXCLUDED.formula_name, flavor=EXCLUDED.flavor, dyes=EXCLUDED.dyes,
 status='approved', updated_at=now();

CREATE TABLE IF NOT EXISTS mes.execution_events (
    event_id bigserial PRIMARY KEY,
    po_number varchar(50) NOT NULL,
    event_type varchar(80) NOT NULL,
    phase varchar(100) NOT NULL,
    equipment_id varchar(80),
    operator_id varchar(120),
    material_code varchar(60),
    material_name varchar(180),
    lot_number varchar(80),
    quantity numeric(18,6),
    unit varchar(30),
    metric varchar(100),
    value double precision,
    message text NOT NULL DEFAULT '',
    severity varchar(20) NOT NULL DEFAULT 'info',
    qualified boolean NOT NULL DEFAULT true,
    event_timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_mes_execution_po_time ON mes.execution_events(po_number,event_timestamp);
CREATE INDEX IF NOT EXISTS ix_mes_execution_material ON mes.execution_events(material_code,lot_number);
CREATE INDEX IF NOT EXISTS ix_mes_execution_equipment ON mes.execution_events(equipment_id,event_timestamp);

CREATE OR REPLACE VIEW mes.batch_execution_summary AS
SELECT po_number,
       min(event_timestamp) AS first_event,
       max(event_timestamp) AS last_event,
       count(*) AS event_count,
       count(*) FILTER (WHERE severity IN ('warning','error','critical') OR NOT qualified) AS exception_count,
       count(DISTINCT operator_id) FILTER (WHERE operator_id IS NOT NULL) AS operator_count,
       count(DISTINCT equipment_id) FILTER (WHERE equipment_id IS NOT NULL) AS equipment_count
FROM mes.execution_events
GROUP BY po_number;

COMMIT;
