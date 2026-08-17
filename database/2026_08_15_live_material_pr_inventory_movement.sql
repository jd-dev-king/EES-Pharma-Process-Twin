BEGIN;
CREATE TABLE IF NOT EXISTS public.material_prs (
 id SERIAL PRIMARY KEY, pr_number VARCHAR(50) UNIQUE NOT NULL, po_number VARCHAR(50) NOT NULL,
 requested_by VARCHAR(100) NOT NULL DEFAULT 'Weigh Technician', weigh_room VARCHAR(30) NOT NULL DEFAULT 'WR-01',
 status VARCHAR(40) NOT NULL DEFAULT 'Submitted', destination VARCHAR(80) NOT NULL DEFAULT 'WH-VEST-01', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.material_pr_lines (
 id SERIAL PRIMARY KEY, pr_number VARCHAR(50) NOT NULL, material_code VARCHAR(50) NOT NULL, material_name VARCHAR(160) NOT NULL,
 lot_number VARCHAR(60) NOT NULL, requested_quantity DOUBLE PRECISION NOT NULL, picked_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
 unit VARCHAR(20) NOT NULL, source_location VARCHAR(80) NOT NULL, hazard_class VARCHAR(40) NOT NULL DEFAULT 'General', pick_sequence INTEGER NOT NULL DEFAULT 1, status VARCHAR(40) NOT NULL DEFAULT 'Requested');
CREATE TABLE IF NOT EXISTS public.material_positions (
 id SERIAL PRIMARY KEY, container_id VARCHAR(80) UNIQUE NOT NULL, material_code VARCHAR(50) NOT NULL, material_name VARCHAR(160) NOT NULL,
 lot_number VARCHAR(60) NOT NULL, quantity DOUBLE PRECISION NOT NULL, unit VARCHAR(20) NOT NULL, location_code VARCHAR(80) NOT NULL,
 status VARCHAR(50) NOT NULL DEFAULT 'Available', hazard_class VARCHAR(40) NOT NULL DEFAULT 'General', po_number VARCHAR(50), pr_number VARCHAR(50), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.material_movements (
 id SERIAL PRIMARY KEY, movement_id VARCHAR(60) UNIQUE NOT NULL, container_id VARCHAR(80) NOT NULL, material_code VARCHAR(50) NOT NULL,
 lot_number VARCHAR(60) NOT NULL, quantity DOUBLE PRECISION NOT NULL, unit VARCHAR(20) NOT NULL, from_location VARCHAR(80) NOT NULL,
 to_location VARCHAR(80) NOT NULL, movement_type VARCHAR(60) NOT NULL, operator VARCHAR(100) NOT NULL, po_number VARCHAR(50), pr_number VARCHAR(50), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_material_positions_location ON public.material_positions(location_code);
CREATE INDEX IF NOT EXISTS ix_material_movements_po ON public.material_movements(po_number);
CREATE INDEX IF NOT EXISTS ix_material_pr_lines_pr ON public.material_pr_lines(pr_number);

-- Lean starting Chem Weigh Staging: roughly one batch only, deliberately forcing PRs for multi-batch campaigns.
WITH seed(material_code, material_name, lot_number, qty, unit, location_code, hazard_class) AS (VALUES
 ('9PHQ9Y1OLM','Prednisolone','PRD-26A0708-01',155.0,'kg','CW-STAGE-01','General'),
 ('XF417D3PSL','Anhydrous Citric Acid','CIT-26A0709-01',15.0,'kg','CW-STAGE-01','General'),
 ('8SKN0B0MIM','Benzoic Acid','BEN-26A0709-01',35.0,'kg','CW-STAGE-01','General'),
 ('7FLD91C86K','Edetate Disodium','EDT-26A0709-01',21.0,'kg','CW-STAGE-01','General'),
 ('SB8ZUX40TY','Saccharin Sodium','SAC-26A0709-01',38.0,'kg','CW-STAGE-01','General'),
 ('3K9958V90M','Alcohol','ALC-26A0709-01',11.0,'kg','CW-HAZ-01','Hazardous'),
 ('BUC5I9595W','Cherry','CHR-26A0710-01',18.5,'kg','CW-HAZ-01','Hazardous'),
 ('FLV-STRAWBERRY-001','Strawberry','STR-26A0812-01',18.5,'kg','CW-HAZ-01','Hazardous'),
 ('FLV-GRAPE-001','Grape','GRP-26A0812-01',18.5,'kg','CW-HAZ-01','Hazardous'),
 ('FLV-BERRY-001','Berry','BRY-26A0812-01',18.5,'kg','CW-HAZ-01','Hazardous'))
INSERT INTO public.material_positions(container_id,material_code,material_name,lot_number,quantity,unit,location_code,status,hazard_class)
SELECT 'STG-'||material_code,material_code,material_name,lot_number,qty,unit,location_code,'Available',hazard_class FROM seed
ON CONFLICT(container_id) DO UPDATE SET quantity=EXCLUDED.quantity, location_code=EXCLUDED.location_code, hazard_class=EXCLUDED.hazard_class, updated_at=now();

-- Candidate alternatives requiring R&D qualification before Office can authorize production use.
CREATE TABLE IF NOT EXISTS public.material_alternative_qualifications (
 id SERIAL PRIMARY KEY, candidate_code VARCHAR(60) UNIQUE NOT NULL, candidate_name VARCHAR(160) NOT NULL,
 target_material_code VARCHAR(60) NOT NULL, approval_status VARCHAR(40) NOT NULL DEFAULT 'R&D Evaluation Required',
 rnd_sample_id VARCHAR(60), decision_note TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO public.material_alternative_qualifications(candidate_code,candidate_name,target_material_code) VALUES
 ('RND-PREDFINE-001','Prednisolone Fine','9PHQ9Y1OLM'),('RND-ETH5-001','Ethanol 5%','3K9958V90M'),
 ('RND-SSUCR-001','Sodium Sucralose','SB8ZUX40TY'),('RND-SCIT-001','Sodium Citrate','XF417D3PSL'),
 ('RND-CIT-001','Citric Acid','XF417D3PSL'),('RND-SPHOS-001','Sodium Phosphate','XF417D3PSL'),
 ('RND-NCHERRY-001','Natural Cherry','BUC5I9595W'),('RND-NGRAPE-001','Natural Grape','FLV-GRAPE-001'),
 ('RND-NSTRAW-001','Natural Strawberry','FLV-STRAWBERRY-001'),('RND-NBERRY-001','Natural Berry','FLV-BERRY-001')
ON CONFLICT(candidate_code) DO NOTHING;

-- Additional bulk vessels for alternate/special bulk and overage storage.
INSERT INTO public.bulk_tanks(tank_code,material_code,material_name,capacity_kg,quantity_kg,qa_status,lot_number,temperature_c,status) VALUES
 ('HSCF-101','HSCF','Alternate / Special Bulk',12000,0,'Empty',NULL,22,'Available'),
 ('BULK-X','C151H8M554','Sucrose',20000,10000,'Released','SUC-X-26A0815-01',22,'Available')
ON CONFLICT(tank_code) DO UPDATE SET material_code=EXCLUDED.material_code,material_name=EXCLUDED.material_name,capacity_kg=EXCLUDED.capacity_kg;
COMMIT;
