-- No destructive schema change is required for this workflow patch.
-- Material positions use controlled location codes directly.

SELECT
    location_code,
    COUNT(*) AS containers,
    SUM(quantity) AS quantity
FROM public.material_positions
WHERE location_code IN (
    'WH-VEST-01',
    'CW-STAGE-01',
    'CW-HAZ-01',
    'WR-01',
    'WR-02',
    'CW-KNIT-01'
)
GROUP BY location_code
ORDER BY location_code;
