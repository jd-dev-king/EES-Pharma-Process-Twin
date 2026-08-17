BEGIN;

-- Campaign workload interlock.
ALTER TABLE public.production_campaigns ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT true;
ALTER TABLE public.production_campaigns ADD COLUMN IF NOT EXISTS accepted_by varchar(100);
ALTER TABLE public.production_campaigns ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

UPDATE public.production_campaigns
SET locked=true,
    status=CASE
      WHEN status IN ('Active','Campaign Assigned') THEN 'Pending Weigh Acceptance'
      ELSE status
    END
WHERE status NOT IN ('Closed','Cancelled');

CREATE TABLE IF NOT EXISTS public.campaign_separation_requests (
    id serial PRIMARY KEY,
    request_id varchar(60) UNIQUE NOT NULL,
    campaign_id varchar(60) NOT NULL,
    po_number varchar(50) NOT NULL,
    requested_by varchar(100) NOT NULL,
    reason text NOT NULL,
    status varchar(40) NOT NULL DEFAULT 'Pending',
    decision_note text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_campaign_separation_campaign ON public.campaign_separation_requests(campaign_id);

-- PRs now belong to a campaign and preserve operator-selected lot lines.
ALTER TABLE public.material_prs ADD COLUMN IF NOT EXISTS campaign_id varchar(60);
CREATE INDEX IF NOT EXISTS ix_material_prs_campaign ON public.material_prs(campaign_id);

ALTER TABLE public.material_pr_lines ADD COLUMN IF NOT EXISTS po_number varchar(50);

-- Live material can be campaign stock until Weighing assigns it to a PO at bend-in.
ALTER TABLE public.material_positions ADD COLUMN IF NOT EXISTS campaign_id varchar(60);
CREATE INDEX IF NOT EXISTS ix_material_positions_campaign ON public.material_positions(campaign_id);

-- Ensure timestamp defaults exist on installations where these tables predated the current migration.
ALTER TABLE public.material_positions ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.material_movements ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.material_prs ALTER COLUMN created_at SET DEFAULT now();

COMMIT;

SELECT campaign_id,po_numbers,status,locked,accepted_by,accepted_at
FROM public.production_campaigns
ORDER BY id DESC;

SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('campaign_separation_requests','material_prs','material_pr_lines','material_positions');
