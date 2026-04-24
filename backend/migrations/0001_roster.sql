-- Roster aggregate: players, tag teams, stables, wrestlers, overalls, transfers.
-- Also creates stub divisions/companies tables that later aggregates will extend.
-- Idempotent (IF NOT EXISTS / DO blocks) so re-running is safe.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE alignment AS ENUM ('face', 'heel', 'neutral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tag_team_status AS ENUM ('pending_partner', 'pending_admin', 'active', 'dissolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stable_status AS ENUM ('pending', 'approved', 'active', 'disbanded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stable_invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wrestler_promotion AS ENUM ('AAA', 'AEW', 'NJPW', 'ROH', 'TNA', 'WCW', 'WWE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wrestler_slot AS ENUM ('primary', 'alternate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Supporting stub tables (extended by later aggregates) ───────────

CREATE TABLE IF NOT EXISTS divisions (
  division_id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  company_id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT,
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Wrestlers (roster pool) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wrestlers (
  wrestler_id UUID PRIMARY KEY,
  promotion wrestler_promotion NOT NULL,
  name TEXT NOT NULL,
  overall_cap SMALLINT NOT NULL CHECK (overall_cap BETWEEN 70 AND 93),
  is_in_use BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_player_id UUID,
  assigned_slot wrestler_slot,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wrestlers_promotion_name_key UNIQUE (promotion, name),
  CONSTRAINT wrestlers_assignment_check CHECK (
    (is_in_use = TRUE AND assigned_player_id IS NOT NULL AND assigned_slot IS NOT NULL) OR
    (is_in_use = FALSE AND assigned_player_id IS NULL AND assigned_slot IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS wrestlers_promotion_idx ON wrestlers(promotion);
CREATE INDEX IF NOT EXISTS wrestlers_available_idx ON wrestlers(promotion, name) WHERE is_in_use = FALSE;

-- ─── Players ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS players (
  player_id UUID PRIMARY KEY,
  user_id TEXT UNIQUE,
  name TEXT NOT NULL,
  current_wrestler TEXT NOT NULL,
  alternate_wrestler TEXT,
  current_wrestler_id UUID REFERENCES wrestlers(wrestler_id) ON DELETE SET NULL,
  alternate_wrestler_id UUID REFERENCES wrestlers(wrestler_id) ON DELETE SET NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  psn_id TEXT,
  division_id UUID REFERENCES divisions(division_id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL,
  stable_id UUID,
  tag_team_id UUID,
  alignment alignment,
  main_overall SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_division_idx ON players(division_id);
CREATE INDEX IF NOT EXISTS players_company_idx ON players(company_id);

DO $$ BEGIN
  ALTER TABLE wrestlers
    ADD CONSTRAINT wrestlers_assigned_player_id_fkey
    FOREIGN KEY (assigned_player_id) REFERENCES players(player_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tag Teams ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tag_teams (
  tag_team_id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  player1_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  player2_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  image_url TEXT,
  status tag_team_status NOT NULL DEFAULT 'pending_partner',
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  dissolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tag_teams_distinct_players CHECK (player1_id <> player2_id)
);
CREATE INDEX IF NOT EXISTS tag_teams_player1_idx ON tag_teams(player1_id);
CREATE INDEX IF NOT EXISTS tag_teams_player2_idx ON tag_teams(player2_id);
CREATE INDEX IF NOT EXISTS tag_teams_status_idx ON tag_teams(status);

DO $$ BEGIN
  ALTER TABLE players
    ADD CONSTRAINT players_tag_team_id_fkey
    FOREIGN KEY (tag_team_id) REFERENCES tag_teams(tag_team_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Stables ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stables (
  stable_id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  leader_id UUID NOT NULL REFERENCES players(player_id) ON DELETE RESTRICT,
  image_url TEXT,
  status stable_status NOT NULL DEFAULT 'pending',
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  disbanded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stables_status_idx ON stables(status);

CREATE TABLE IF NOT EXISTS stable_members (
  stable_id UUID NOT NULL REFERENCES stables(stable_id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stable_id, player_id)
);
CREATE INDEX IF NOT EXISTS stable_members_player_idx ON stable_members(player_id);

DO $$ BEGIN
  ALTER TABLE players
    ADD CONSTRAINT players_stable_id_fkey
    FOREIGN KEY (stable_id) REFERENCES stables(stable_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Stable Invitations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stable_invitations (
  invitation_id UUID PRIMARY KEY,
  stable_id UUID NOT NULL REFERENCES stables(stable_id) ON DELETE CASCADE,
  invited_player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  invited_by_player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  status stable_invitation_status NOT NULL DEFAULT 'pending',
  message TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stable_invitations_stable_idx ON stable_invitations(stable_id);
CREATE INDEX IF NOT EXISTS stable_invitations_invited_player_idx ON stable_invitations(invited_player_id);
CREATE INDEX IF NOT EXISTS stable_invitations_pending_idx
  ON stable_invitations(invited_player_id)
  WHERE status = 'pending';

-- ─── Wrestler Overalls ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wrestler_overalls (
  player_id UUID PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  main_overall SMALLINT NOT NULL,
  alternate_overall SMALLINT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Transfer Requests ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transfer_requests (
  request_id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  from_division_id UUID REFERENCES divisions(division_id) ON DELETE SET NULL,
  to_division_id UUID REFERENCES divisions(division_id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status transfer_status NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfer_requests_player_idx ON transfer_requests(player_id);
CREATE INDEX IF NOT EXISTS transfer_requests_status_idx ON transfer_requests(status);
CREATE INDEX IF NOT EXISTS transfer_requests_player_pending_idx
  ON transfer_requests(player_id)
  WHERE status = 'pending';

COMMIT;
