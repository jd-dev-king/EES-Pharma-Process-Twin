BEGIN;

-- Consolidate duplicate live positions already created in Chem Weigh Staging.
-- Identical material + lot + location + unit + hazard is one physical lot
-- position with a summed quantity.

CREATE TEMP TABLE _staging_merge AS
SELECT
    location_code,
    material_code,
    material_name,
    lot_number,
    unit,
    hazard_class,
    MIN(id) AS keep_id,
    SUM(quantity) AS merged_quantity,
    COUNT(*) AS row_count
FROM public.material_positions
WHERE location_code IN ('CW-STAGE-01','CW-HAZ-01')
  AND status NOT IN ('Consumed','Scrapped')
GROUP BY
    location_code,
    material_code,
    material_name,
    lot_number,
    unit,
    hazard_class
HAVING COUNT(*) > 1;

-- Update the canonical row with the combined physical quantity.
UPDATE public.material_positions mp
SET
    quantity = m.merged_quantity,
    status = 'Staged',
    updated_at = now()
FROM _staging_merge m
WHERE mp.id = m.keep_id;

-- Remove only the redundant live-position rows.
-- Movement history remains intact in material_movements.
DELETE FROM public.material_positions mp
USING _staging_merge m
WHERE mp.location_code = m.location_code
  AND mp.material_code = m.material_code
  AND mp.material_name = m.material_name
  AND mp.lot_number = m.lot_number
  AND mp.unit = m.unit
  AND mp.hazard_class = m.hazard_class
  AND mp.id <> m.keep_id;

COMMIT;

-- Verification: there should now be one row per staged material/lot/location.
SELECT
    location_code,
    material_code,
    material_name,
    lot_number,
    quantity,
    unit,
    hazard_class,
    COUNT(*) OVER (
        PARTITION BY location_code,material_code,lot_number,unit,hazard_class
    ) AS identical_position_rows
FROM public.material_positions
WHERE location_code IN ('CW-STAGE-01','CW-HAZ-01')
  AND status NOT IN ('Consumed','Scrapped')
ORDER BY location_code,material_name,lot_number;
