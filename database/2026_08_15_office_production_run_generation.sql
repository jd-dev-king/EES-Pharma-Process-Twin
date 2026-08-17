-- Office production-run generation display-name normalization
-- Safe to run repeatedly.
DO $$
BEGIN
  IF to_regclass('mes.formulation_master') IS NOT NULL THEN
    UPDATE mes.formulation_master SET formula_name = CASE material_number
      WHEN 'PDFC-0813' THEN 'Dye Free Cherry'
      WHEN 'PC-1308'   THEN 'Cherry'
      WHEN 'PDFS-0914' THEN 'Dye Free Strawberry'
      WHEN 'PS-1409'   THEN 'Strawberry'
      WHEN 'PDFG-0715' THEN 'Dye Free Grape'
      WHEN 'PG-1507'   THEN 'Grape'
      WHEN 'PDFB-0616' THEN 'Dye Free Berry'
      WHEN 'PB-1606'   THEN 'Berry'
      ELSE formula_name
    END
    WHERE material_number IN ('PDFC-0813','PC-1308','PDFS-0914','PS-1409','PDFG-0715','PG-1507','PDFB-0616','PB-1606');
  END IF;
END $$;
