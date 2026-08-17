BEGIN;

-- ============================================================
-- EES PHARMA PROCESS TWIN
-- Starting Inventory + Emergency Substitutes + Bulk PO Materials
-- ============================================================

-- ------------------------------------------------------------
-- 1. Increase primary released warehouse inventory
--    enough for realistic 1-4 PO campaign testing.
-- ------------------------------------------------------------
WITH targets(material_code, per_lot_qty) AS (
    VALUES
      ('9PHQ9Y1OLM', 800.0000::numeric),          -- Prednisolone
      ('3K9958V90M', 250.0000::numeric),          -- Alcohol
      ('XF417D3PSL', 250.0000::numeric),          -- Anhydrous Citric Acid
      ('8SKN0B0MIM', 300.0000::numeric),          -- Benzoic Acid
      ('7FLD91C86K', 200.0000::numeric),          -- Edetate Disodium
      ('SB8ZUX40TY', 250.0000::numeric),          -- Saccharin Sodium
      ('BUC5I9595W', 150.0000::numeric),          -- Cherry
      ('FLV-STRAWBERRY-001', 150.0000::numeric),  -- Strawberry
      ('FLV-GRAPE-001', 150.0000::numeric),       -- Grape
      ('FLV-BERRY-001', 150.0000::numeric),       -- Berry
      ('H3R47K3TBD', 10.0000::numeric),           -- Blue 1
      ('WZB9127XOA', 10.0000::numeric),           -- Red 40
      ('DYE-RED33-001', 10.0000::numeric),        -- Red 33
      ('DYE-YELLOW5-001', 10.0000::numeric)       -- Yellow 5
)
UPDATE supply.material_lots ml
SET
    available_quantity = GREATEST(
        ml.available_quantity,
        t.per_lot_qty
    ),
    received_quantity = GREATEST(
        ml.received_quantity,
        t.per_lot_qty + COALESCE(ml.reserved_quantity, 0)
    ),
    status = CASE
        WHEN lower(ml.status) IN ('available', 'released', 'reserved')
            THEN 'released'
        ELSE ml.status
    END,
    updated_at = now()
FROM supply.material_catalog mc,
     targets t
WHERE ml.supply_material_id = mc.supply_material_id
  AND mc.material_code = t.material_code;


-- ------------------------------------------------------------
-- 2. Add emergency substitute material master records
--    to supply.material_catalog.
--
-- IMPORTANT:
-- material_type is inherited from the source/primary material
-- so it complies with supply_material_type_check.
-- ------------------------------------------------------------
WITH alt(
    material_code,
    material_name,
    unit_of_measure,
    source_code
) AS (
    VALUES
      (
        'ALT-PSP-001',
        'Prednisolone Sodium Phosphate',
        'kg',
        '9PHQ9Y1OLM'
      ),
      (
        'ALT-ETH-001',
        'Ethyl Alcohol',
        'kg',
        '3K9958V90M'
      ),
      (
        'ALT-MSP-001',
        'Monobasic Sodium Phosphate',
        'kg',
        'XF417D3PSL'
      ),
      (
        'ALT-SBENZ-001',
        'Sodium Benzoate',
        'kg',
        '8SKN0B0MIM'
      ),
      (
        'ALT-EDTA-001',
        'EDTA',
        'kg',
        '7FLD91C86K'
      ),
      (
        'ALT-SUCR-001',
        'Sucralose',
        'kg',
        'SB8ZUX40TY'
      ),
      (
        'ART-CHERRY-001',
        'ART Cherry',
        'kg',
        'BUC5I9595W'
      ),
      (
        'ART-STRAWBERRY-001',
        'ART Strawberry',
        'kg',
        'FLV-STRAWBERRY-001'
      ),
      (
        'ART-GRAPE-001',
        'ART Grape',
        'kg',
        'FLV-GRAPE-001'
      ),
      (
        'ART-BERRY-001',
        'ART Berry',
        'kg',
        'FLV-BERRY-001'
      )
)
INSERT INTO supply.material_catalog (
    material_code,
    material_name,
    material_type,
    unit_of_measure,
    preferred_supplier_id,
    reorder_point,
    reorder_quantity,
    active
)
SELECT
    a.material_code,
    a.material_name,
    src.material_type,
    a.unit_of_measure,
    src.preferred_supplier_id,
    25.0000,
    250.0000,
    true
FROM alt a
JOIN supply.material_catalog src
  ON src.material_code = a.source_code
ON CONFLICT (material_code) DO UPDATE
SET
    material_name = EXCLUDED.material_name,
    material_type = EXCLUDED.material_type,
    unit_of_measure = EXCLUDED.unit_of_measure,
    preferred_supplier_id = EXCLUDED.preferred_supplier_id,
    active = true,
    updated_at = now();


-- ------------------------------------------------------------
-- 3. Add matching substitute materials to pharma.materials.
--
-- material_type is also inherited from the normal Pharma
-- material so we do not violate a Pharma-side type constraint.
-- ------------------------------------------------------------
WITH alt(
    material_code,
    material_name,
    unit_of_measure,
    source_code
) AS (
    VALUES
      (
        'ALT-PSP-001',
        'Prednisolone Sodium Phosphate',
        'kg',
        '9PHQ9Y1OLM'
      ),
      (
        'ALT-ETH-001',
        'Ethyl Alcohol',
        'kg',
        '3K9958V90M'
      ),
      (
        'ALT-MSP-001',
        'Monobasic Sodium Phosphate',
        'kg',
        'XF417D3PSL'
      ),
      (
        'ALT-SBENZ-001',
        'Sodium Benzoate',
        'kg',
        '8SKN0B0MIM'
      ),
      (
        'ALT-EDTA-001',
        'EDTA',
        'kg',
        '7FLD91C86K'
      ),
      (
        'ALT-SUCR-001',
        'Sucralose',
        'kg',
        'SB8ZUX40TY'
      ),
      (
        'ART-CHERRY-001',
        'ART Cherry',
        'kg',
        'BUC5I9595W'
      ),
      (
        'ART-STRAWBERRY-001',
        'ART Strawberry',
        'kg',
        'FLV-STRAWBERRY-001'
      ),
      (
        'ART-GRAPE-001',
        'ART Grape',
        'kg',
        'FLV-GRAPE-001'
      ),
      (
        'ART-BERRY-001',
        'ART Berry',
        'kg',
        'FLV-BERRY-001'
      )
)
INSERT INTO pharma.materials (
    material_code,
    material_name,
    material_type,
    unit_of_measure,
    specification_reference,
    supplier_name,
    lot_controlled,
    active
)
SELECT
    a.material_code,
    a.material_name,
    src.material_type,
    a.unit_of_measure,
    'EES simulation emergency alternate - Office approval required',
    COALESCE(src.supplier_name, 'Approved Emergency Supplier'),
    true,
    true
FROM alt a
JOIN pharma.materials src
  ON src.material_code = a.source_code
ON CONFLICT (material_code) DO UPDATE
SET
    material_name = EXCLUDED.material_name,
    material_type = EXCLUDED.material_type,
    unit_of_measure = EXCLUDED.unit_of_measure,
    specification_reference = EXCLUDED.specification_reference,
    supplier_name = EXCLUDED.supplier_name,
    lot_controlled = true,
    active = true,
    updated_at = now();


-- ------------------------------------------------------------
-- 4. Add two released lots for each emergency substitute.
-- ------------------------------------------------------------
WITH loc AS (
    SELECT location_id
    FROM supply.inventory_locations
    WHERE location_code = 'WH-EXC-B01'
    LIMIT 1
),
seed(
    material_code,
    lot_number,
    qty,
    expiry_date
) AS (
    VALUES
      (
        'ALT-PSP-001',
        'PSP-26A0815-01',
        500.0000,
        DATE '2028-08-15'
      ),
      (
        'ALT-PSP-001',
        'PSP-26A0815-02',
        500.0000,
        DATE '2028-08-15'
      ),

      (
        'ALT-ETH-001',
        'ETH-26A0815-01',
        250.0000,
        DATE '2028-08-15'
      ),
      (
        'ALT-ETH-001',
        'ETH-26A0815-02',
        250.0000,
        DATE '2028-08-15'
      ),

      (
        'ALT-MSP-001',
        'MSP-26A0815-01',
        250.0000,
        DATE '2029-08-15'
      ),
      (
        'ALT-MSP-001',
        'MSP-26A0815-02',
        250.0000,
        DATE '2029-08-15'
      ),

      (
        'ALT-SBENZ-001',
        'SBZ-26A0815-01',
        300.0000,
        DATE '2029-08-15'
      ),
      (
        'ALT-SBENZ-001',
        'SBZ-26A0815-02',
        300.0000,
        DATE '2029-08-15'
      ),

      (
        'ALT-EDTA-001',
        'EDA-26A0815-01',
        200.0000,
        DATE '2029-08-15'
      ),
      (
        'ALT-EDTA-001',
        'EDA-26A0815-02',
        200.0000,
        DATE '2029-08-15'
      ),

      (
        'ALT-SUCR-001',
        'SUCALT-26A0815-01',
        250.0000,
        DATE '2029-08-15'
      ),
      (
        'ALT-SUCR-001',
        'SUCALT-26A0815-02',
        250.0000,
        DATE '2029-08-15'
      ),

      (
        'ART-CHERRY-001',
        'ART-CHR-26A0815-01',
        150.0000,
        DATE '2027-08-15'
      ),
      (
        'ART-CHERRY-001',
        'ART-CHR-26A0815-02',
        150.0000,
        DATE '2027-08-15'
      ),

      (
        'ART-STRAWBERRY-001',
        'ART-STR-26A0815-01',
        150.0000,
        DATE '2027-08-15'
      ),
      (
        'ART-STRAWBERRY-001',
        'ART-STR-26A0815-02',
        150.0000,
        DATE '2027-08-15'
      ),

      (
        'ART-GRAPE-001',
        'ART-GRP-26A0815-01',
        150.0000,
        DATE '2027-08-15'
      ),
      (
        'ART-GRAPE-001',
        'ART-GRP-26A0815-02',
        150.0000,
        DATE '2027-08-15'
      ),

      (
        'ART-BERRY-001',
        'ART-BRY-26A0815-01',
        150.0000,
        DATE '2027-08-15'
      ),
      (
        'ART-BERRY-001',
        'ART-BRY-26A0815-02',
        150.0000,
        DATE '2027-08-15'
      )
)
INSERT INTO supply.material_lots (
    supply_material_id,
    supplier_id,
    supplier_lot_number,
    internal_lot_number,
    received_quantity,
    available_quantity,
    reserved_quantity,
    unit_of_measure,
    status,
    received_at,
    expiry_date,
    location_id
)
SELECT
    mc.supply_material_id,
    mc.preferred_supplier_id,
    seed.lot_number || '-SUP',
    seed.lot_number,
    seed.qty,
    seed.qty,
    0,
    mc.unit_of_measure,
    'released',
    now(),
    seed.expiry_date,
    loc.location_id
FROM seed
JOIN supply.material_catalog mc
  ON mc.material_code = seed.material_code
CROSS JOIN loc
ON CONFLICT (internal_lot_number) DO UPDATE
SET
    received_quantity = EXCLUDED.received_quantity,
    available_quantity = GREATEST(
        supply.material_lots.available_quantity,
        EXCLUDED.available_quantity
    ),
    reserved_quantity = LEAST(
        supply.material_lots.reserved_quantity,
        EXCLUDED.received_quantity
    ),
    unit_of_measure = EXCLUDED.unit_of_measure,
    status = 'released',
    expiry_date = EXCLUDED.expiry_date,
    location_id = EXCLUDED.location_id,
    updated_at = now();


-- ------------------------------------------------------------
-- 5. Load bulk tanks to realistic starting levels.
--
-- Bulk path:
-- Truck Unload -> Bulk Tank -> Mix Tank
-- These materials never enter PAS-X Weighing.
-- ------------------------------------------------------------
UPDATE public.bulk_tanks
SET
    quantity_kg = CASE tank_code
        WHEN 'PW-101'  THEN 30000.0
        WHEN 'PG-101'  THEN 15000.0
        WHEN 'GLY-101' THEN 12000.0
        WHEN 'SUC-101' THEN 16000.0
        ELSE quantity_kg
    END,
    qa_status = CASE
        WHEN tank_code IN (
            'PW-101',
            'PG-101',
            'GLY-101',
            'SUC-101'
        )
        THEN 'Released'
        ELSE qa_status
    END,
    status = CASE
        WHEN tank_code IN (
            'PW-101',
            'PG-101',
            'GLY-101',
            'SUC-101'
        )
        THEN 'Available'
        ELSE status
    END
WHERE tank_code IN (
    'PW-101',
    'PG-101',
    'GLY-101',
    'SUC-101'
);


-- ------------------------------------------------------------
-- 6. Keep bulk materials present on every active PO.
--
-- These are PO genealogy requirements but are NOT Warehouse /
-- Weighing dispense requirements.
-- ------------------------------------------------------------
WITH bulk(
    material_code,
    material_name,
    required_quantity,
    unit
) AS (
    VALUES
      (
        '059QF0KO0R',
        'Water',
        4000.0::double precision,
        'kg'
      ),
      (
        'PDC6A3C0OX',
        'Glycerin',
        920.0::double precision,
        'kg'
      ),
      (
        '6DC9Q167V3',
        'Propylene Glycol',
        750.0::double precision,
        'kg'
      ),
      (
        'C151H8M554',
        'Sucrose',
        2175.0::double precision,
        'kg'
      )
)
INSERT INTO public.material_requirements (
    po_number,
    material_code,
    material_name,
    required_quantity,
    unit,
    assigned_lot,
    status
)
SELECT
    po.po_number,
    bulk.material_code,
    bulk.material_name,
    bulk.required_quantity,
    bulk.unit,
    NULL,
    'Bulk - Direct Transfer'
FROM public.production_orders po
CROSS JOIN bulk
WHERE lower(COALESCE(po.status, '')) NOT IN (
    'shipped',
    'shipped/closed',
    'closed',
    'released',
    'complete',
    'completed',
    'cancelled'
)
AND NOT EXISTS (
    SELECT 1
    FROM public.material_requirements mr
    WHERE mr.po_number = po.po_number
      AND mr.material_code = bulk.material_code
);


COMMIT;


-- ============================================================
-- VERIFICATION
-- ============================================================

-- Emergency substitutes and their available inventory.
SELECT
    mc.material_code,
    mc.material_name,
    mc.material_type,
    COUNT(ml.material_lot_id) AS released_lots,
    SUM(ml.available_quantity) AS available
FROM supply.material_catalog mc
JOIN supply.material_lots ml
  ON ml.supply_material_id = mc.supply_material_id
WHERE mc.material_code IN (
    'ALT-PSP-001',
    'ALT-ETH-001',
    'ALT-MSP-001',
    'ALT-SBENZ-001',
    'ALT-EDTA-001',
    'ALT-SUCR-001',
    'ART-CHERRY-001',
    'ART-STRAWBERRY-001',
    'ART-GRAPE-001',
    'ART-BERRY-001'
)
GROUP BY
    mc.material_code,
    mc.material_name,
    mc.material_type
ORDER BY
    mc.material_name;


-- Verify bulk tanks.
SELECT
    tank_code,
    material_name,
    quantity_kg,
    capacity_kg,
    qa_status,
    status
FROM public.bulk_tanks
WHERE tank_code IN (
    'PW-101',
    'PG-101',
    'GLY-101',
    'SUC-101'
)
ORDER BY tank_code;


-- Verify active PO material requirements, including bulk.
SELECT
    mr.po_number,
    mr.material_name,
    mr.material_code,
    mr.required_quantity,
    mr.unit,
    mr.status
FROM public.material_requirements mr
JOIN public.production_orders po
  ON po.po_number = mr.po_number
WHERE lower(COALESCE(po.status, '')) NOT IN (
    'shipped',
    'shipped/closed',
    'closed',
    'released',
    'complete',
    'completed',
    'cancelled'
)
ORDER BY
    mr.po_number,
    mr.material_name;