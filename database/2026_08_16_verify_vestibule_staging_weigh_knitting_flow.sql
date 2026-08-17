SELECT
    location_code,
    material_name,
    lot_number,
    quantity,
    unit,
    campaign_id,
    po_number,
    status
FROM public.material_positions
WHERE location_code IN ('WH-VEST-01','CW-STAGE-01','CW-HAZ-01','WR-01','WR-02','CW-KNIT-01')
ORDER BY location_code,material_name,lot_number;
