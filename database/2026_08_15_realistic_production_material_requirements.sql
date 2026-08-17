-- Align active Pharma Process production requirements with the approved 4,200 kg demo recipe.
-- Safe for active, not-yet-finalized POs. Historical closed/shipped/released POs are not changed.

UPDATE public.material_requirements mr
SET required_quantity = CASE mr.material_code
    WHEN '9PHQ9Y1OLM' THEN 152.5
    WHEN '3K9958V90M' THEN 10.0
    WHEN 'XF417D3PSL' THEN 14.2
    WHEN '8SKN0B0MIM' THEN 34.3
    WHEN '7FLD91C86K' THEN 20.0
    WHEN 'SB8ZUX40TY' THEN 37.0
    WHEN 'BUC5I9595W' THEN 17.8
    WHEN 'FLV-STRAWBERRY-001' THEN 17.8
    WHEN 'FLV-BERRY-001' THEN 17.8
    WHEN 'FLV-GRAPE-001' THEN 17.8
    WHEN 'DYE-RED33-001' THEN CASE po.material_number WHEN 'PC-1308' THEN 600.0 WHEN 'PS-1409' THEN 150.0 ELSE mr.required_quantity END
    WHEN 'WZB9127XOA' THEN CASE po.material_number WHEN 'PC-1308' THEN 600.0 WHEN 'PG-1507' THEN 450.0 WHEN 'PB-1606' THEN 500.0 ELSE mr.required_quantity END
    WHEN 'DYE-YELLOW5-001' THEN CASE po.material_number WHEN 'PS-1409' THEN 100.0 ELSE mr.required_quantity END
    WHEN 'H3R47K3TBD' THEN CASE po.material_number WHEN 'PG-1507' THEN 400.0 ELSE mr.required_quantity END
    ELSE mr.required_quantity
  END,
  unit = CASE
    WHEN mr.material_code IN ('DYE-RED33-001','WZB9127XOA','DYE-YELLOW5-001','H3R47K3TBD') THEN 'g'
    ELSE 'kg'
  END
FROM public.production_orders po
WHERE po.po_number = mr.po_number
  AND lower(COALESCE(po.status,'')) NOT IN ('shipped','shipped/closed','closed','released','complete','completed','cancelled');

-- Keep canonical Pharma batch-material genealogy synchronized.
-- PostgreSQL does not allow the target table alias (bm) to be referenced
-- inside a JOIN ... ON clause in UPDATE ... FROM, so all target correlation
-- is kept in the WHERE clause below.
UPDATE pharma.batch_materials AS bm
SET required_quantity = CASE m.material_code
    WHEN '9PHQ9Y1OLM' THEN 152.5
    WHEN '3K9958V90M' THEN 10.0
    WHEN 'XF417D3PSL' THEN 14.2
    WHEN '8SKN0B0MIM' THEN 34.3
    WHEN '7FLD91C86K' THEN 20.0
    WHEN 'SB8ZUX40TY' THEN 37.0
    WHEN 'BUC5I9595W' THEN 17.8
    WHEN 'FLV-STRAWBERRY-001' THEN 17.8
    WHEN 'FLV-BERRY-001' THEN 17.8
    WHEN 'FLV-GRAPE-001' THEN 17.8
    WHEN '059QF0KO0R' THEN 4000.0
    WHEN 'PDC6A3C0OX' THEN 920.0
    WHEN '6DC9Q167V3' THEN 750.0
    WHEN 'C151H8M554' THEN 2175.0
    WHEN 'DYE-RED33-001' THEN CASE rpo.material_number WHEN 'PC-1308' THEN 600.0 WHEN 'PS-1409' THEN 150.0 ELSE bm.required_quantity END
    WHEN 'WZB9127XOA' THEN CASE rpo.material_number WHEN 'PC-1308' THEN 600.0 WHEN 'PG-1507' THEN 450.0 WHEN 'PB-1606' THEN 500.0 ELSE bm.required_quantity END
    WHEN 'DYE-YELLOW5-001' THEN CASE rpo.material_number WHEN 'PS-1409' THEN 100.0 ELSE bm.required_quantity END
    WHEN 'H3R47K3TBD' THEN CASE rpo.material_number WHEN 'PG-1507' THEN 400.0 ELSE bm.required_quantity END
    ELSE bm.required_quantity
  END,
  unit_of_measure = CASE
    WHEN m.material_code IN ('DYE-RED33-001','WZB9127XOA','DYE-YELLOW5-001','H3R47K3TBD') THEN 'g'
    ELSE 'kg'
  END
FROM pharma.materials AS m,
     pharma.batches AS b,
     pharma.production_orders AS ppo,
     public.production_orders AS rpo
WHERE bm.material_id = m.material_id
  AND bm.batch_id = b.batch_id
  AND ppo.production_order_id = b.production_order_id
  AND rpo.po_number = ppo.po_number
  AND lower(COALESCE(rpo.status,'')) NOT IN ('shipped','shipped/closed','closed','released','complete','completed','cancelled')
  AND lower(COALESCE(bm.weighing_status,'pending')) NOT IN ('verified','complete','completed');
