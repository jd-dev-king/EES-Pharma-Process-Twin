BEGIN;

-- ============================================================
-- Deterministic Demo Baseline
-- ============================================================
-- Captures the current total plant stock once, while preserving a lean
-- staging target. The reset endpoint subsequently restores these values.

CREATE TABLE IF NOT EXISTS public.demo_supply_lot_baseline (
    internal_lot_number varchar(120) PRIMARY KEY,
    material_code varchar(80) NOT NULL,
    available_quantity numeric(18,4) NOT NULL,
    reserved_quantity numeric(18,4) NOT NULL DEFAULT 0,
    status varchar(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.demo_bulk_tank_baseline (
    tank_code varchar(60) PRIMARY KEY,
    quantity_kg numeric(18,4) NOT NULL,
    qa_status varchar(60) NOT NULL,
    lot_number varchar(120),
    temperature_c numeric(10,3),
    status varchar(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.demo_staging_baseline (
    container_id varchar(160) PRIMARY KEY,
    material_code varchar(80) NOT NULL,
    material_name varchar(180) NOT NULL,
    lot_number varchar(120) NOT NULL,
    quantity numeric(18,4) NOT NULL,
    unit varchar(30) NOT NULL,
    location_code varchar(60) NOT NULL,
    hazard_class varchar(40) NOT NULL
);

-- Capture lean staging exactly as it should appear after every reset.
-- If identical lot rows exist, they are consolidated into one baseline row.
INSERT INTO public.demo_staging_baseline(
    container_id,material_code,material_name,lot_number,quantity,unit,
    location_code,hazard_class
)
SELECT
    'RESET-STG-' || material_code || '-' ||
      regexp_replace(lot_number,'[^A-Za-z0-9]+','','g') || '-' || location_code,
    material_code,
    MAX(material_name),
    lot_number,
    SUM(quantity),
    MAX(unit),
    location_code,
    MAX(hazard_class)
FROM public.material_positions
WHERE location_code IN ('CW-STAGE-01','CW-HAZ-01')
  AND status NOT IN ('Consumed','Scrapped')
GROUP BY material_code,lot_number,location_code
ON CONFLICT(container_id) DO UPDATE SET
    quantity=EXCLUDED.quantity,
    material_name=EXCLUDED.material_name,
    unit=EXCLUDED.unit,
    hazard_class=EXCLUDED.hazard_class;

-- Capture the TOTAL plant quantity for each Warehouse lot:
-- current Warehouse available + any live physical quantity from the same lot
-- outside the Warehouse. This prevents a mid-Weighing installation from
-- accidentally losing stock in the baseline.
INSERT INTO public.demo_supply_lot_baseline(
    internal_lot_number,material_code,available_quantity,reserved_quantity,status
)
SELECT
    ml.internal_lot_number,
    mc.material_code,
    ml.available_quantity
      + COALESCE((
          SELECT SUM(mp.quantity)
          FROM public.material_positions mp
          WHERE mp.lot_number=ml.internal_lot_number
            AND mp.status NOT IN ('Consumed','Scrapped')
        ),0),
    0,
    CASE WHEN lower(ml.status) IN ('available','released','reserved') THEN 'available'
         ELSE ml.status END
FROM supply.material_lots ml
JOIN supply.material_catalog mc
  ON mc.supply_material_id=ml.supply_material_id
ON CONFLICT(internal_lot_number) DO NOTHING;

-- Bulk is not consumed during Weighing, so the current configured bulk state
-- is the desired reset baseline. This preserves HFCS = 18,000 kg as configured.
INSERT INTO public.demo_bulk_tank_baseline(
    tank_code,quantity_kg,qa_status,lot_number,temperature_c,status
)
SELECT tank_code,quantity_kg,qa_status,lot_number,temperature_c,status
FROM public.bulk_tanks
ON CONFLICT(tank_code) DO UPDATE SET
    quantity_kg=EXCLUDED.quantity_kg,
    qa_status=EXCLUDED.qa_status,
    lot_number=EXCLUDED.lot_number,
    temperature_c=EXCLUDED.temperature_c,
    status=EXCLUDED.status;

COMMIT;

-- Verification.
SELECT 'SUPPLY LOTS' AS baseline, COUNT(*) AS rows
FROM public.demo_supply_lot_baseline
UNION ALL
SELECT 'STAGING',COUNT(*) FROM public.demo_staging_baseline
UNION ALL
SELECT 'BULK TANKS',COUNT(*) FROM public.demo_bulk_tank_baseline;

SELECT material_name,lot_number,quantity,unit,location_code
FROM public.demo_staging_baseline
ORDER BY location_code,material_name;
