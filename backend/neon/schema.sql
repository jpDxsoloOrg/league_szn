-- League SZN — Neon/Postgres exploratory schema
-- See ../../docs/plans/plan-017-neon-tables-and-seed.md for the design rationale.
--
-- Safe to re-run: drops everything in reverse dependency order, then recreates.
-- Point this at the Neon `seed-sandbox` branch only. Never run against a branch
-- with data you care about.

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
-- Drop everything (reverse dependency order, CASCADE to be safe)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS event_match_cards            CASCADE;
DROP TABLE IF EXISTS season_standings             CASCADE;
DROP TABLE IF EXISTS championship_reign_holders   CASCADE;
DROP TABLE IF EXISTS championship_reigns          CASCADE;
DROP TABLE IF EXISTS match_participants           CASCADE;
DROP TABLE IF EXISTS matches                      CASCADE;
DROP TABLE IF EXISTS events                       CASCADE;
DROP TABLE IF EXISTS tournaments                  CASCADE;
DROP TABLE IF EXISTS championships                CASCADE;
DROP TABLE IF EXISTS seasons                      CASCADE;
DROP TABLE IF EXISTS players                      CASCADE;
DROP TABLE IF EXISTS divisions                    CASCADE;

DROP TYPE IF EXISTS season_status;
DROP TYPE IF EXISTS championship_type;
DROP TYPE IF EXISTS match_type;
DROP TYPE IF EXISTS match_status;
DROP TYPE IF EXISTS participant_outcome;
DROP TYPE IF EXISTS event_type;
DROP TYPE IF EXISTS event_status;
DROP TYPE IF EXISTS tournament_type;
DROP TYPE IF EXISTS tournament_status;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE season_status       AS ENUM ('active', 'completed');
CREATE TYPE championship_type   AS ENUM ('singles', 'tag');
CREATE TYPE match_type          AS ENUM ('singles', 'tag', 'triple-threat', 'fatal-four-way', 'battle-royal');
CREATE TYPE match_status        AS ENUM ('scheduled', 'in-progress', 'completed', 'cancelled');
CREATE TYPE participant_outcome AS ENUM ('win', 'loss', 'draw', 'pending');
CREATE TYPE event_type          AS ENUM ('ppv', 'weekly', 'special');
CREATE TYPE event_status        AS ENUM ('upcoming', 'in-progress', 'completed', 'cancelled');
CREATE TYPE tournament_type     AS ENUM ('single-elimination', 'round-robin');
CREATE TYPE tournament_status   AS ENUM ('pending', 'in-progress', 'completed');

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE divisions (
    division_id   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT          NOT NULL UNIQUE,
    description   TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE players (
    player_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT          NOT NULL,
    current_wrestler  TEXT,
    image_url         TEXT,
    division_id       UUID          REFERENCES divisions (division_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
    -- Intentionally no wins/losses/draws columns. Derive from match_participants:
    --   SELECT player_id, COUNT(*) FILTER (WHERE outcome='win')  AS wins, ...
    --   FROM match_participants
    --   GROUP BY player_id;
);

CREATE TABLE seasons (
    season_id   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT          NOT NULL,
    start_date  TIMESTAMPTZ   NOT NULL,
    end_date    TIMESTAMPTZ,
    status      season_status NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Only one season can be active at a time (matches current Dynamo invariant).
CREATE UNIQUE INDEX seasons_one_active ON seasons (status) WHERE status = 'active';

CREATE TABLE championships (
    championship_id  UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT               NOT NULL,
    type             championship_type  NOT NULL,
    image_url        TEXT,
    division_id      UUID               REFERENCES divisions (division_id) ON DELETE SET NULL,
    is_active        BOOLEAN            NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ        NOT NULL DEFAULT now()
    -- No current_champion column. Derive from championship_reigns WHERE lost_date IS NULL.
);

CREATE TABLE tournaments (
    tournament_id  UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT               NOT NULL,
    type           tournament_type    NOT NULL,
    status         tournament_status  NOT NULL DEFAULT 'pending',
    participants   UUID[]             NOT NULL DEFAULT '{}',
    brackets       JSONB,
    standings      JSONB,
    winner_id      UUID               REFERENCES players (player_id) ON DELETE SET NULL,
    season_id      UUID               REFERENCES seasons (season_id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ        NOT NULL DEFAULT now()
    -- brackets/standings kept as JSONB intentionally for this first pass.
    -- Normalizing tournament_matches is a later plan decision.
);

CREATE TABLE events (
    event_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT          NOT NULL,
    event_type        event_type    NOT NULL,
    date              TIMESTAMPTZ   NOT NULL,
    venue             TEXT,
    description       TEXT,
    theme_color       TEXT,
    status            event_status  NOT NULL DEFAULT 'upcoming',
    season_id         UUID          REFERENCES seasons (season_id) ON DELETE SET NULL,
    fantasy_enabled   BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE matches (
    match_id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    date             TIMESTAMPTZ    NOT NULL,
    match_type       match_type     NOT NULL,
    stipulation      TEXT,
    is_championship  BOOLEAN        NOT NULL DEFAULT FALSE,
    championship_id  UUID           REFERENCES championships (championship_id) ON DELETE SET NULL,
    season_id        UUID           REFERENCES seasons (season_id)             ON DELETE SET NULL,
    tournament_id    UUID           REFERENCES tournaments (tournament_id)     ON DELETE SET NULL,
    event_id         UUID           REFERENCES events (event_id)               ON DELETE SET NULL,
    status           match_status   NOT NULL DEFAULT 'scheduled',
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE match_participants (
    match_id    UUID                 NOT NULL REFERENCES matches (match_id) ON DELETE CASCADE,
    player_id   UUID                 NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    outcome     participant_outcome  NOT NULL DEFAULT 'pending',
    team_label  TEXT,  -- used for tag matches; NULL for singles
    PRIMARY KEY (match_id, player_id)
);

CREATE TABLE championship_reigns (
    reign_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    championship_id  UUID          NOT NULL REFERENCES championships (championship_id) ON DELETE CASCADE,
    won_date         TIMESTAMPTZ   NOT NULL,
    lost_date        TIMESTAMPTZ,                -- NULL means this is the current reign
    match_id         UUID          REFERENCES matches (match_id) ON DELETE SET NULL,
    defenses         INTEGER       NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- At most one open reign per championship.
CREATE UNIQUE INDEX championship_reigns_one_open
    ON championship_reigns (championship_id)
    WHERE lost_date IS NULL;

CREATE TABLE championship_reign_holders (
    reign_id   UUID  NOT NULL REFERENCES championship_reigns (reign_id) ON DELETE CASCADE,
    player_id  UUID  NOT NULL REFERENCES players (player_id)            ON DELETE CASCADE,
    PRIMARY KEY (reign_id, player_id)
);

CREATE TABLE season_standings (
    season_id   UUID         NOT NULL REFERENCES seasons (season_id) ON DELETE CASCADE,
    player_id   UUID         NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    wins        INTEGER      NOT NULL DEFAULT 0,
    losses      INTEGER      NOT NULL DEFAULT 0,
    draws       INTEGER      NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (season_id, player_id)
);

CREATE TABLE event_match_cards (
    event_id      UUID     NOT NULL REFERENCES events (event_id)   ON DELETE CASCADE,
    match_id      UUID     NOT NULL REFERENCES matches (match_id)  ON DELETE CASCADE,
    position      INTEGER  NOT NULL,
    designation   TEXT,    -- 'opener' | 'midcard' | 'main-event' (free-form for now)
    notes         TEXT,
    PRIMARY KEY (event_id, match_id)
);
