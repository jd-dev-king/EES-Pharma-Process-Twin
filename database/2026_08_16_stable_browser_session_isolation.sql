BEGIN;

-- ============================================================
-- EES Pharma Process Twin - Browser Session Isolation
-- ============================================================
-- The earlier safe-reset prototype created public.demo_reset_requests with
-- reset_request_id/demo_session_id/campaign_id/... columns.  The stable
-- session-isolation implementation uses request_id/session_id and adds
-- explicit session/entity ownership tables.
--
-- Preserve the prototype audit rows rather than dropping them.

DO $$
BEGIN
    IF to_regclass('public.demo_reset_requests') IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name='demo_reset_requests'
              AND column_name='reset_request_id'
        ) THEN
            IF to_regclass('public.demo_reset_requests_legacy_20260816') IS NULL THEN
                ALTER TABLE public.demo_reset_requests
                    RENAME TO demo_reset_requests_legacy_20260816;
            ELSE
                DROP TABLE public.demo_reset_requests;
            END IF;
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.demo_sessions (
    session_id varchar(120) PRIMARY KEY,
    status varchar(40) NOT NULL DEFAULT 'Active',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demo_session_entities (
    session_id varchar(120) NOT NULL
        REFERENCES public.demo_sessions(session_id) ON DELETE CASCADE,
    entity_type varchar(60) NOT NULL,
    entity_id varchar(160) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(session_id,entity_type,entity_id)
);

CREATE INDEX IF NOT EXISTS ix_demo_session_entities_active
    ON public.demo_session_entities(session_id,active,entity_type);

CREATE TABLE IF NOT EXISTS public.demo_reset_requests (
    request_id varchar(80) PRIMARY KEY,
    session_id varchar(120) NOT NULL
        REFERENCES public.demo_sessions(session_id),
    reset_scope varchar(30) NOT NULL DEFAULT 'SESSION',
    operator varchar(120) NOT NULL,
    reason varchar(300) NOT NULL,
    status varchar(80) NOT NULL DEFAULT 'Requested',
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_demo_reset_requests_session
    ON public.demo_reset_requests(session_id,requested_at DESC);

COMMIT;

-- Verification.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
      'demo_sessions',
      'demo_session_entities',
      'demo_reset_requests',
      'demo_reset_requests_legacy_20260816'
  )
ORDER BY table_name;

SELECT
    request_id,
    session_id,
    reset_scope,
    operator,
    reason,
    status,
    requested_at,
    completed_at
FROM public.demo_reset_requests
ORDER BY requested_at DESC
LIMIT 50;
