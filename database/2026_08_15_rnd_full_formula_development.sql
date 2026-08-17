BEGIN;

-- ============================================================
-- MES BOOTSTRAP
-- ============================================================

CREATE SCHEMA IF NOT EXISTS mes;


-- ------------------------------------------------------------
-- Controlled production / R&D approved formulation master
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mes.formulation_master (
    material_number varchar(40) PRIMARY KEY,
    formula_name varchar(180) NOT NULL,
    product_name varchar(200) NOT NULL
        DEFAULT 'Liquid Prednisone 15 mg/5 mL',

    flavor varchar(100),

    -- Exact approved dye combination.
    -- Dye-free formulas use [].
    dyes jsonb NOT NULL DEFAULT '[]'::jsonb,

    status varchar(40) NOT NULL DEFAULT 'development',

    approved_by varchar(120),
    approved_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mes_formula_status_check
        CHECK (
            status IN (
                'development',
                'testing',
                'requires-more-testing',
                'approved',
                'rejected',
                'retired'
            )
        )
);


-- ------------------------------------------------------------
-- Seed the eight currently approved production formulas.
-- These are the formulas Office already uses.
-- ------------------------------------------------------------
INSERT INTO mes.formulation_master (
    material_number,
    formula_name,
    product_name,
    flavor,
    dyes,
    status,
    approved_by,
    approved_at
)
VALUES

(
    'PDFC-0813',
    'Dye Free Cherry',
    'Liquid Prednisone 15 mg/5 mL',
    'Cherry',
    '[]'::jsonb,
    'approved',
    'Existing Production Master',
    now()
),

(
    'PC-1308',
    'Cherry',
    'Liquid Prednisone 15 mg/5 mL',
    'Cherry',
    '[
        "FD&C Red No. 33",
        "FD&C Red No. 40"
    ]'::jsonb,
    'approved',
    'Existing Production Master',
    now()
),

(
    'PDFS-0914',
    'Dye Free Strawberry',
    'Liquid Prednisone 15 mg/5 mL',
    'Strawberry',
    '[]'::jsonb,
    'approved',
    'Existing Production Master',
    now()
),

(
    'PS-1409',
    'Strawberry',
    'Liquid Prednisone 15 mg/5 mL',
    'Strawberry',
    '[
        "FD&C Red No. 33",
        "FD&C Yellow No. 5"
    ]'::jsonb,
    'approved',
    'Existing Production Master',
    now()
),

(
    'PDFG-0715',
    'Dye Free Grape',
    'Liquid Prednisone 15 mg/5 mL',
    'Grape',
    '[]'::jsonb,
    'approved',
    'Existing Production Master',
    now()
),

(
    'PG-1507',
    'Grape',
    'Liquid Prednisone 15 mg/5 mL',
    'Grape',
    '[
        "FD&C Blue No. 1",
        "FD&C Red No. 40"
    ]'::jsonb,
    'approved',
    'Existing Production Master',
    now()
),

(
    'PDFB-0616',
    'Dye Free Berry',
    'Liquid Prednisone 15 mg/5 mL',
    'Berry',
    '[]'::jsonb,
    'approved',
    'Existing Production Master',
    now()
),

(
    'PB-1606',
    'Berry',
    'Liquid Prednisone 15 mg/5 mL',
    'Berry',
    '[
        "FD&C Red No. 40"
    ]'::jsonb,
    'approved',
    'Existing Production Master',
    now()
)

ON CONFLICT (material_number) DO UPDATE
SET
    formula_name = EXCLUDED.formula_name,
    product_name = EXCLUDED.product_name,
    flavor = EXCLUDED.flavor,
    dyes = EXCLUDED.dyes,
    status = EXCLUDED.status,
    approved_by = EXCLUDED.approved_by,
    approved_at = COALESCE(
        mes.formulation_master.approved_at,
        EXCLUDED.approved_at
    ),
    updated_at = now();

-- Expand the existing R&D sample-batch runtime table.
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS test_po_number varchar(60);
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS formula_code varchar(60);
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS formula_name varchar(180);
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS disposition varchar(50) NOT NULL DEFAULT 'Draft';
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 1;
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS materials_json text NOT NULL DEFAULT '[]';
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS bulk_json text NOT NULL DEFAULT '[]';
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS process_json text NOT NULL DEFAULT '{}';
ALTER TABLE public.rnd_sample_batches ADD COLUMN IF NOT EXISTS promoted_material_number varchar(60);

CREATE UNIQUE INDEX IF NOT EXISTS ix_rnd_sample_batches_test_po
ON public.rnd_sample_batches(test_po_number)
WHERE test_po_number IS NOT NULL;

-- Persist the exact approved development recipe that was promoted to production.
CREATE TABLE IF NOT EXISTS mes.rnd_formula_materials (
    id bigserial PRIMARY KEY,
    material_number varchar(40) NOT NULL REFERENCES mes.formulation_master(material_number) ON DELETE CASCADE,
    sequence_no integer NOT NULL,
    material_code varchar(60) NOT NULL,
    material_name varchar(180) NOT NULL,
    quantity numeric(18,4) NOT NULL,
    unit varchar(30) NOT NULL,
    role varchar(40) NOT NULL DEFAULT 'manual',
    source varchar(120) NOT NULL DEFAULT 'R&D',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(material_number, sequence_no)
);

-- Make sure R&D candidate qualification table contains all requested candidates.
INSERT INTO public.material_alternative_qualifications
(candidate_code,candidate_name,target_material_code,approval_status)
VALUES
 ('RND-PREDFINE-001','Prednisolone Fine','9PHQ9Y1OLM','R&D Evaluation Required'),
 ('RND-ETH5-001','Ethanol 5%','3K9958V90M','R&D Evaluation Required'),
 ('RND-SSUCR-001','Sodium Sucralose','SB8ZUX40TY','R&D Evaluation Required'),
 ('RND-SCIT-001','Sodium Citrate','XF417D3PSL','R&D Evaluation Required'),
 ('RND-CIT-001','Citric Acid','XF417D3PSL','R&D Evaluation Required'),
 ('RND-SPHOS-001','Sodium Phosphate','XF417D3PSL','R&D Evaluation Required'),
 ('RND-NCHERRY-001','Natural Cherry','BUC5I9595W','R&D Evaluation Required'),
 ('RND-NGRAPE-001','Natural Grape','FLV-GRAPE-001','R&D Evaluation Required'),
 ('RND-NSTRAW-001','Natural Strawberry','FLV-STRAWBERRY-001','R&D Evaluation Required'),
 ('RND-NBERRY-001','Natural Berry','FLV-BERRY-001','R&D Evaluation Required')
ON CONFLICT(candidate_code) DO UPDATE SET
 candidate_name=EXCLUDED.candidate_name,
 target_material_code=EXCLUDED.target_material_code,
 updated_at=now();

-- Ensure alternate/special and overage bulk vessels are available to R&D.
INSERT INTO public.bulk_tanks
(tank_code,material_code,material_name,capacity_kg,quantity_kg,qa_status,lot_number,temperature_c,status)
VALUES
 ('HSCF-101','HSCF','Alternate / Special Bulk',12000,2500,'Released','HSCF-RND-260815',22,'Available'),
 ('BULK-X','C151H8M554','Sucrose',20000,10000,'Released','SUC-X-26A0815-01',22,'Available')
ON CONFLICT(tank_code) DO UPDATE SET
 material_name=EXCLUDED.material_name,
 capacity_kg=EXCLUDED.capacity_kg,
 qa_status=EXCLUDED.qa_status,
 status=EXCLUDED.status;

COMMIT;

SELECT candidate_code,candidate_name,target_material_code,approval_status
FROM public.material_alternative_qualifications
ORDER BY candidate_name;

SELECT tank_code,material_name,quantity_kg,qa_status,status
FROM public.bulk_tanks
WHERE tank_code IN ('PW-101','PG-101','GLY-101','SUC-101','HSCF-101','BULK-X')
ORDER BY tank_code;
