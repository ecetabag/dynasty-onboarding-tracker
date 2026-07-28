-- Run this once, by hand, in the Vercel Postgres dashboard's query tab, right after
-- provisioning and linking the database to this project. There is no migration
-- tooling in this repo -- this file is documentation, not something any code runs.

CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_client_id_created_at_idx
  ON notes (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS company_checks (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,
  company TEXT NOT NULL,
  verdict TEXT NOT NULL,       -- 'likely_active' | 'possibly_defunct' | 'unknown'
  rationale TEXT NOT NULL,
  checked_by_email TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_checks_client_id_checked_at_idx
  ON company_checks (client_id, checked_at DESC);

-- "Needs Your Input" decisions (conflict resolution + fuzzy-match approve/reject).
-- One row per (client_id, kind) -- upserted on conflict, so it always reflects the
-- latest decision and everyone viewing the dashboard sees the same resolved state,
-- not just whoever's browser made the call.
CREATE TABLE IF NOT EXISTS review_actions (
  client_id TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'conflict' | 'fuzzy_review'
  decision TEXT NOT NULL,      -- 'live' | 'churned' for conflict; 'approve' | 'reject' for fuzzy_review
  reason TEXT,
  decided_by_email TEXT NOT NULL,
  decided_by_name TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, kind)
);
