BEGIN;

-- Workflow states introduced by campaign interlock and live custody
-- are intentionally descriptive and can exceed the legacy varchar(40).

ALTER TABLE public.production_orders
    ALTER COLUMN status TYPE varchar(100);

ALTER TABLE public.production_campaigns
    ALTER COLUMN status TYPE varchar(100);

ALTER TABLE public.material_prs
    ALTER COLUMN status TYPE varchar(100);

ALTER TABLE public.material_pr_lines
    ALTER COLUMN status TYPE varchar(100);

ALTER TABLE public.material_positions
    ALTER COLUMN status TYPE varchar(100);

ALTER TABLE public.campaign_separation_requests
    ALTER COLUMN status TYPE varchar(100);

COMMIT;

SELECT
    table_name,
    column_name,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'status'
  AND table_name IN (
      'production_orders',
      'production_campaigns',
      'material_prs',
      'material_pr_lines',
      'material_positions',
      'campaign_separation_requests'
  )
ORDER BY table_name;
