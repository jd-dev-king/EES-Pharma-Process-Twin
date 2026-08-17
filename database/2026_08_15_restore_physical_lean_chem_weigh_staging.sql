BEGIN;

-- ============================================================
-- Restore lean Chem Weigh Staging inventory
-- ============================================================
-- This migration creates real staged containers and moves the
-- corresponding quantity OUT of the Warehouse lot so plant
-- inventory is not double-counted.
--
-- Target staging is intentionally only about one batch worth.
-- Multi-PO campaigns must still raise a Material PR.

ALTER TABLE public.material_positions
    ALTER COLUMN updated_at SET DEFAULT now();

-- Target staged quantities and exact source lots.
CREATE TEMP TABLE _staging_seed (
    container_id varchar(120) PRIMARY KEY,
    material_code varchar(60) NOT NULL,
    material_name varchar(180) NOT NULL,
    lot_number varchar(120) NOT NULL,
    target_quantity numeric(18,4) NOT NULL,
    unit varchar(30) NOT NULL,
    location_code varchar(60) NOT NULL,
    hazard_class varchar(40) NOT NULL
) ON COMMIT DROP;

INSERT INTO _staging_seed
(container_id,material_code,material_name,lot_number,target_quantity,unit,location_code,hazard_class)
VALUES
 ('STG-9PHQ9Y1OLM','9PHQ9Y1OLM','Prednisolone','PRD-26A0708-01',155.0000,'kg','CW-STAGE-01','General'),
 ('STG-XF417D3PSL','XF417D3PSL','Anhydrous Citric Acid','CIT-26A0709-01',15.0000,'kg','CW-STAGE-01','General'),
 ('STG-8SKN0B0MIM','8SKN0B0MIM','Benzoic Acid','BEN-26A0709-01',35.0000,'kg','CW-STAGE-01','General'),
 ('STG-7FLD91C86K','7FLD91C86K','Edetate Disodium','EDT-26A0709-01',21.0000,'kg','CW-STAGE-01','General'),
 ('STG-SB8ZUX40TY','SB8ZUX40TY','Saccharin Sodium','SAC-26A0709-01',38.0000,'kg','CW-STAGE-01','General'),

 -- Hazardous material is staged only in the segregated hazardous area.
 ('STG-3K9958V90M','3K9958V90M','Alcohol','ALC-26A0709-01',11.0000,'kg','CW-HAZ-01','Hazardous'),
 ('STG-BUC5I9595W','BUC5I9595W','Cherry','CHR-26A0710-01',18.5000,'kg','CW-HAZ-01','Hazardous'),
 ('STG-FLV-STRAWBERRY-001','FLV-STRAWBERRY-001','Strawberry','STR-26A0812-01',18.5000,'kg','CW-HAZ-01','Hazardous'),
 ('STG-FLV-GRAPE-001','FLV-GRAPE-001','Grape','GRP-26A0812-01',18.5000,'kg','CW-HAZ-01','Hazardous'),
 ('STG-FLV-BERRY-001','FLV-BERRY-001','Berry','BRY-26A0812-01',18.5000,'kg','CW-HAZ-01','Hazardous');

-- Determine how much needs to be moved from Warehouse on THIS run.
-- This keeps the migration idempotent and prevents repeated deductions.
CREATE TEMP TABLE _staging_delta AS
SELECT
    s.*,
    GREATEST(
        0::numeric,
        s.target_quantity - COALESCE(mp.quantity::numeric, 0)
    ) AS qty_to_move
FROM _staging_seed s
LEFT JOIN public.material_positions mp
  ON mp.container_id = s.container_id
 AND mp.location_code IN ('CW-STAGE-01','CW-HAZ-01');

-- Validate each source lot exists.
DO $$
DECLARE
    missing_lots text;
BEGIN
    SELECT string_agg(d.lot_number, ', ')
      INTO missing_lots
    FROM _staging_delta d
    WHERE NOT EXISTS (
        SELECT 1
        FROM supply.material_lots ml
        WHERE ml.internal_lot_number = d.lot_number
    );

    IF missing_lots IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot restore staging. Missing Warehouse lot(s): %', missing_lots;
    END IF;
END $$;

-- Validate enough warehouse quantity exists for the NEW movement amount.
DO $$
DECLARE
    shortages text;
BEGIN
    SELECT string_agg(
        d.material_name || ' / ' || d.lot_number ||
        ' needs ' || d.qty_to_move::text ||
        ' but Warehouse has ' || ml.available_quantity::text,
        '; '
    )
    INTO shortages
    FROM _staging_delta d
    JOIN supply.material_lots ml
      ON ml.internal_lot_number = d.lot_number
    WHERE d.qty_to_move > ml.available_quantity;

    IF shortages IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot restore staging due to Warehouse shortage: %', shortages;
    END IF;
END $$;

-- Physically move the required delta out of the Warehouse lot.
UPDATE supply.material_lots ml
SET
    available_quantity = ml.available_quantity - d.qty_to_move,
    updated_at = now()
FROM _staging_delta d
WHERE ml.internal_lot_number = d.lot_number
  AND d.qty_to_move > 0;

-- Create / restore the live staged containers.
INSERT INTO public.material_positions (
    container_id,
    material_code,
    material_name,
    lot_number,
    quantity,
    unit,
    location_code,
    status,
    hazard_class,
    campaign_id,
    po_number,
    pr_number,
    updated_at
)
SELECT
    container_id,
    material_code,
    material_name,
    lot_number,
    target_quantity,
    unit,
    location_code,
    'Available',
    hazard_class,
    NULL,
    NULL,
    NULL,
    now()
FROM _staging_seed
ON CONFLICT (container_id) DO UPDATE SET
    material_code = EXCLUDED.material_code,
    material_name = EXCLUDED.material_name,
    lot_number = EXCLUDED.lot_number,
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    location_code = EXCLUDED.location_code,
    status = 'Available',
    hazard_class = EXCLUDED.hazard_class,
    campaign_id = NULL,
    po_number = NULL,
    pr_number = NULL,
    updated_at = now();

-- Record the initial physical staging movement for audit/MES visibility
-- only for quantities actually moved on this run.
INSERT INTO public.material_movements (
    container_id,
    material_code,
    lot_number,
    quantity,
    unit,
    from_location,
    to_location,
    movement_type,
    performed_by,
    po_number,
    pr_number,
    status,
    created_at
)
SELECT
    d.container_id,
    d.material_code,
    d.lot_number,
    d.qty_to_move,
    d.unit,
    COALESCE(
        (
            SELECT COALESCE(
                to_jsonb(il)->>'location_code',
                to_jsonb(il)->>'location_name',
                'WAREHOUSE'
            )
            FROM supply.material_lots ml
            LEFT JOIN supply.inventory_locations il
              ON il.location_id = ml.location_id
            WHERE ml.internal_lot_number = d.lot_number
            LIMIT 1
        ),
        'WAREHOUSE'
    ),
    d.location_code,
    'INITIAL_STAGING_REPLENISHMENT',
    'Inventory Control',
    NULL,
    NULL,
    'Complete',
    now()
FROM _staging_delta d
WHERE d.qty_to_move > 0;

COMMIT;

-- ============================================================
-- Verification: what Weighing should now see
-- ============================================================

SELECT
    mp.material_code,
    mp.material_name,
    mp.lot_number,
    mp.quantity,
    mp.unit,
    mp.location_code,
    mp.status,
    mp.hazard_class
FROM public.material_positions mp
WHERE mp.location_code IN ('CW-STAGE-01','CW-HAZ-01')
ORDER BY mp.location_code, mp.material_name;

-- Compare staged and remaining Warehouse inventory for the same lots.
SELECT
    mc.material_code,
    mc.material_name,
    ml.internal_lot_number AS warehouse_lot,
    ml.available_quantity AS warehouse_available,
    COALESCE(mp.quantity,0) AS staged_quantity,
    COALESCE(mp.location_code,'NOT STAGED') AS staged_location
FROM supply.material_catalog mc
JOIN supply.material_lots ml
  ON ml.supply_material_id = mc.supply_material_id
LEFT JOIN public.material_positions mp
  ON mp.material_code = mc.material_code
 AND mp.lot_number = ml.internal_lot_number
 AND mp.location_code IN ('CW-STAGE-01','CW-HAZ-01')
WHERE mc.material_code IN (
    '9PHQ9Y1OLM',
    '3K9958V90M',
    'XF417D3PSL',
    '8SKN0B0MIM',
    '7FLD91C86K',
    'SB8ZUX40TY',
    'BUC5I9595W',
    'FLV-STRAWBERRY-001',
    'FLV-GRAPE-001',
    'FLV-BERRY-001'
)
ORDER BY mc.material_name, ml.internal_lot_number;
