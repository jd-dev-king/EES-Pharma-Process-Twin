BEGIN;

CREATE TABLE IF NOT EXISTS public.demo_reset_requests (
    reset_request_id bigserial PRIMARY KEY,
    demo_session_id varchar(120),
    campaign_id varchar(120),
    po_numbers text,
    requested_by varchar(160) NOT NULL,
    reason text,
    reset_scope varchar(30) NOT NULL DEFAULT 'SESSION',
    status varchar(80) NOT NULL DEFAULT 'Pending Admin Reconciliation',
    requested_at timestamptz NOT NULL DEFAULT now(),
    reviewed_by varchar(160),
    reviewed_at timestamptz,
    admin_note text
);

CREATE INDEX IF NOT EXISTS ix_demo_reset_requests_status
    ON public.demo_reset_requests(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS ix_demo_reset_requests_campaign
    ON public.demo_reset_requests(campaign_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS ix_demo_reset_requests_session
    ON public.demo_reset_requests(demo_session_id, requested_at DESC);

COMMIT;

SELECT
    reset_request_id,
    demo_session_id,
    campaign_id,
    po_numbers,
    requested_by,
    reset_scope,
    status,
    requested_at
FROM public.demo_reset_requests
ORDER BY requested_at DESC
LIMIT 50;
