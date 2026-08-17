BEGIN;

-- Restore deliberately lean Chem Weigh Staging inventory.
-- Roughly one batch is staged; multi-PO campaigns must raise a PR.
ALTER TABLE public.material_positions
    ALTER COLUMN updated_at SET DEFAULT now();

WITH seed(
    container_id,material_code,material_name,lot_number,quantity,unit,location_code,hazard_class
) AS (
    VALUES
      ('STG-9PHQ9Y1OLM','9PHQ9Y1OLM','Prednisolone','PRD-26A0708-01',155.0,'kg','CW-STAGE-01','General'),
      ('STG-XF417D3PSL','XF417D3PSL','Anhydrous Citric Acid','CIT-26A0709-01',15.0,'kg','CW-STAGE-01','General'),
      ('STG-8SKN0B0MIM','8SKN0B0MIM','Benzoic Acid','BEN-26A0709-01',35.0,'kg','CW-STAGE-01','General'),
      ('STG-7FLD91C86K','7FLD91C86K','Edetate Disodium','EDT-26A0709-01',21.0,'kg','CW-STAGE-01','General'),
      ('STG-SB8ZUX40TY','SB8ZUX40TY','Saccharin Sodium','SAC-26A0709-01',38.0,'kg','CW-STAGE-01','General'),
      ('STG-3K9958V90M','3K9958V90M','Alcohol','ALC-26A0709-01',11.0,'kg','CW-HAZ-01','Hazardous'),
      ('STG-BUC5I9595W','BUC5I9595W','Cherry','CHR-26A0710-01',18.5,'kg','CW-HAZ-01','Hazardous'),
      ('STG-FLV-STRAWBERRY-001','FLV-STRAWBERRY-001','Strawberry','STR-26A0812-01',18.5,'kg','CW-HAZ-01','Hazardous'),
      ('STG-FLV-GRAPE-001','FLV-GRAPE-001','Grape','GRP-26A0812-01',18.5,'kg','CW-HAZ-01','Hazardous'),
      ('STG-FLV-BERRY-001','FLV-BERRY-001','Berry','BRY-26A0812-01',18.5,'kg','CW-HAZ-01','Hazardous')
)
INSERT INTO public.material_positions(
    container_id,material_code,material_name,lot_number,quantity,unit,
    location_code,status,hazard_class,campaign_id,po_number,pr_number,updated_at
)
SELECT
    container_id,material_code,material_name,lot_number,quantity,unit,
    location_code,'Available',hazard_class,NULL,NULL,NULL,now()
FROM seed
ON CONFLICT(container_id) DO UPDATE SET
    material_code=EXCLUDED.material_code,
    material_name=EXCLUDED.material_name,
    lot_number=EXCLUDED.lot_number,
    quantity=EXCLUDED.quantity,
    unit=EXCLUDED.unit,
    location_code=EXCLUDED.location_code,
    status='Available',
    hazard_class=EXCLUDED.hazard_class,
    campaign_id=NULL,
    po_number=NULL,
    pr_number=NULL,
    updated_at=now();

COMMIT;

SELECT container_id,material_name,lot_number,quantity,unit,location_code,status,hazard_class
FROM public.material_positions
WHERE location_code IN ('CW-STAGE-01','CW-HAZ-01')
ORDER BY location_code,material_name;
