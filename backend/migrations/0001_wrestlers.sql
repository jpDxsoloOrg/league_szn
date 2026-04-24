-- Additive migration layered on top of the seed-sandbox schema.
-- Closes two gaps needed for DB_DRIVER=postgres to back the existing handlers:
--   1. Wrestlers roster (table, enums, FK columns on players) — matches the
--      DynamoDB Wrestlers table and the Wrestler/WrestlerOverall domain types.
--   2. Denormalized wins/losses/draws counters on players, tag_teams, stables.
--      The Player / TagTeam / Stable domain types require these fields; we
--      maintain them through the UnitOfWork's incrementPlayerRecord etc.,
--      same pattern as the DynamoDB driver.
-- Also adds players.company_id for parity with the Player.companyId field.
--
-- All changes are idempotent (IF NOT EXISTS / duplicate_object guards).

BEGIN;

-- ─── Enums ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE wrestler_promotion AS ENUM ('AAA', 'AEW', 'NJPW', 'ROH', 'TNA', 'WCW', 'WWE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wrestler_slot AS ENUM ('primary', 'alternate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Wrestlers roster ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wrestlers (
  wrestler_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion wrestler_promotion NOT NULL,
  name TEXT NOT NULL,
  overall_cap SMALLINT NOT NULL CHECK (overall_cap BETWEEN 70 AND 93),
  is_in_use BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_player_id UUID REFERENCES players(player_id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS wrestlers_available_idx
  ON wrestlers(promotion, name) WHERE is_in_use = FALSE;

-- ─── Players additions ───────────────────────────────────────────────

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS current_wrestler_id UUID
    REFERENCES wrestlers(wrestler_id) ON DELETE SET NULL;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS alternate_wrestler_id UUID
    REFERENCES wrestlers(wrestler_id) ON DELETE SET NULL;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES companies(company_id) ON DELETE SET NULL;

ALTER TABLE players ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS draws INTEGER NOT NULL DEFAULT 0;

-- ─── Tag team counters ───────────────────────────────────────────────

ALTER TABLE tag_teams ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tag_teams ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tag_teams ADD COLUMN IF NOT EXISTS draws INTEGER NOT NULL DEFAULT 0;

-- ─── Stable counters ─────────────────────────────────────────────────

ALTER TABLE stables ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stables ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stables ADD COLUMN IF NOT EXISTS draws INTEGER NOT NULL DEFAULT 0;

COMMIT;
