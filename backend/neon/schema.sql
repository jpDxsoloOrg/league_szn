-- League SZN — Neon/Postgres schema (Phase 1 of plan-018)
-- See docs/plans/plan-018-migrate-site-to-neon.md for rationale.
--
-- Covers 35 of 36 current DynamoDB tables. The Presence table stays on
-- DynamoDB; see §16 of plan-018.
--
-- Safe to re-run: drops everything in reverse dependency order first.
-- Point this at the Neon `seed-sandbox` branch only.

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
-- Drop everything (reverse dependency order, CASCADE)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS match_invitations                 CASCADE;
DROP TABLE IF EXISTS matchmaking_queue                 CASCADE;
DROP TABLE IF EXISTS storyline_request_targets         CASCADE;
DROP TABLE IF EXISTS storyline_requests                CASCADE;
DROP TABLE IF EXISTS transfer_requests                 CASCADE;
DROP TABLE IF EXISTS video_tags                        CASCADE;
DROP TABLE IF EXISTS videos                            CASCADE;
DROP TABLE IF EXISTS notifications                     CASCADE;
DROP TABLE IF EXISTS announcements                     CASCADE;
DROP TABLE IF EXISTS promo_reactions                   CASCADE;
DROP TABLE IF EXISTS promos                            CASCADE;
DROP TABLE IF EXISTS challenges                        CASCADE;
DROP TABLE IF EXISTS fantasy_pick_items                CASCADE;
DROP TABLE IF EXISTS fantasy_picks                     CASCADE;
DROP TABLE IF EXISTS wrestler_cost_history             CASCADE;
DROP TABLE IF EXISTS wrestler_costs                    CASCADE;
DROP TABLE IF EXISTS wrestler_overalls                 CASCADE;
DROP TABLE IF EXISTS ranking_history                   CASCADE;
DROP TABLE IF EXISTS contender_overrides               CASCADE;
DROP TABLE IF EXISTS contender_rankings                CASCADE;
DROP TABLE IF EXISTS season_awards                     CASCADE;
DROP TABLE IF EXISTS event_check_ins                   CASCADE;
DROP TABLE IF EXISTS event_companies                   CASCADE;
DROP TABLE IF EXISTS event_match_cards                 CASCADE;
DROP TABLE IF EXISTS season_standings                  CASCADE;
DROP TABLE IF EXISTS championship_reign_holders        CASCADE;
DROP TABLE IF EXISTS championship_reigns               CASCADE;
DROP TABLE IF EXISTS match_participants                CASCADE;
DROP TABLE IF EXISTS matches                           CASCADE;
DROP TABLE IF EXISTS events                            CASCADE;
DROP TABLE IF EXISTS tournaments                       CASCADE;
DROP TABLE IF EXISTS championships                     CASCADE;
DROP TABLE IF EXISTS seasons                           CASCADE;
DROP TABLE IF EXISTS stable_invitations                CASCADE;
DROP TABLE IF EXISTS stable_members                    CASCADE;
DROP TABLE IF EXISTS stables                           CASCADE;
DROP TABLE IF EXISTS tag_teams                         CASCADE;
DROP TABLE IF EXISTS players                           CASCADE;
DROP TABLE IF EXISTS shows                             CASCADE;
DROP TABLE IF EXISTS companies                         CASCADE;
DROP TABLE IF EXISTS match_types                       CASCADE;
DROP TABLE IF EXISTS stipulations                      CASCADE;
DROP TABLE IF EXISTS divisions                         CASCADE;
DROP TABLE IF EXISTS site_config                       CASCADE;
DROP TABLE IF EXISTS fantasy_config                    CASCADE;

DROP TYPE IF EXISTS season_status;
DROP TYPE IF EXISTS championship_type;
DROP TYPE IF EXISTS match_type;
DROP TYPE IF EXISTS match_status;
DROP TYPE IF EXISTS participant_outcome;
DROP TYPE IF EXISTS event_type;
DROP TYPE IF EXISTS event_status;
DROP TYPE IF EXISTS event_check_in_status;
DROP TYPE IF EXISTS tournament_type;
DROP TYPE IF EXISTS tournament_status;
DROP TYPE IF EXISTS player_alignment;
DROP TYPE IF EXISTS stable_status;
DROP TYPE IF EXISTS stable_invitation_status;
DROP TYPE IF EXISTS tag_team_status;
DROP TYPE IF EXISTS challenge_status;
DROP TYPE IF EXISTS challenge_mode;
DROP TYPE IF EXISTS promo_type;
DROP TYPE IF EXISTS promo_reaction_type;
DROP TYPE IF EXISTS show_schedule;
DROP TYPE IF EXISTS day_of_week;
DROP TYPE IF EXISTS season_award_type;
DROP TYPE IF EXISTS contender_override_type;
DROP TYPE IF EXISTS cost_reset_strategy;
DROP TYPE IF EXISTS video_category;
DROP TYPE IF EXISTS notification_type;
DROP TYPE IF EXISTS notification_source_type;
DROP TYPE IF EXISTS transfer_request_status;
DROP TYPE IF EXISTS storyline_request_type;
DROP TYPE IF EXISTS storyline_request_status;
DROP TYPE IF EXISTS match_invitation_status;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE season_status            AS ENUM ('active', 'completed');
CREATE TYPE championship_type        AS ENUM ('singles', 'tag');
CREATE TYPE match_type               AS ENUM ('singles', 'tag', 'triple-threat', 'fatal-four-way', 'battle-royal');
CREATE TYPE match_status             AS ENUM ('scheduled', 'in-progress', 'completed', 'cancelled');
CREATE TYPE participant_outcome      AS ENUM ('win', 'loss', 'draw', 'pending');
CREATE TYPE event_type               AS ENUM ('ppv', 'weekly', 'special', 'house');
CREATE TYPE event_status             AS ENUM ('upcoming', 'in-progress', 'completed', 'cancelled');
CREATE TYPE event_check_in_status    AS ENUM ('available', 'tentative', 'unavailable');
CREATE TYPE tournament_type          AS ENUM ('single-elimination', 'round-robin');
CREATE TYPE tournament_status        AS ENUM ('pending', 'upcoming', 'in-progress', 'completed');
CREATE TYPE player_alignment         AS ENUM ('face', 'heel', 'neutral');
CREATE TYPE stable_status            AS ENUM ('pending', 'approved', 'active', 'disbanded');
CREATE TYPE stable_invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
CREATE TYPE tag_team_status          AS ENUM ('pending_partner', 'pending_admin', 'active', 'dissolved');
CREATE TYPE challenge_status         AS ENUM ('pending', 'accepted', 'declined', 'countered', 'scheduled', 'expired', 'cancelled');
CREATE TYPE challenge_mode           AS ENUM ('singles', 'tag_team');
CREATE TYPE promo_type               AS ENUM ('open-mic', 'call-out', 'response', 'pre-match', 'post-match', 'championship', 'return');
CREATE TYPE promo_reaction_type      AS ENUM ('fire', 'mic', 'trash', 'mind-blown', 'clap');
CREATE TYPE show_schedule            AS ENUM ('weekly', 'ppv', 'special');
CREATE TYPE day_of_week              AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
CREATE TYPE season_award_type        AS ENUM ('mvp', 'longest_win_streak', 'iron_man', 'best_win_pct', 'most_title_defenses', 'custom');
CREATE TYPE contender_override_type  AS ENUM ('bump_to_top', 'send_to_bottom');
CREATE TYPE cost_reset_strategy      AS ENUM ('reset', 'carry_over', 'partial');
CREATE TYPE video_category           AS ENUM ('match', 'highlight', 'promo', 'other');
CREATE TYPE notification_type        AS ENUM ('promo_mention', 'challenge_received', 'match_scheduled', 'announcement', 'stable_invitation', 'tag_team_invitation', 'transfer_reviewed', 'match_invitation', 'match_invitation_declined');
CREATE TYPE notification_source_type AS ENUM ('promo', 'challenge', 'match', 'announcement', 'stable', 'tag_team', 'transfer', 'match_invitation', 'match_invitation_declined');
CREATE TYPE transfer_request_status  AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE storyline_request_type   AS ENUM ('storyline', 'backstage_attack', 'rivalry');
CREATE TYPE storyline_request_status AS ENUM ('pending', 'acknowledged', 'declined');
CREATE TYPE match_invitation_status  AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — config/reference data (no outbound FKs)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE fantasy_config (
    config_key                   TEXT        PRIMARY KEY,  -- always 'GLOBAL' for now
    default_budget               INTEGER     NOT NULL DEFAULT 500,
    default_picks_per_division   INTEGER     NOT NULL DEFAULT 2,
    base_win_points              INTEGER     NOT NULL DEFAULT 10,
    championship_bonus           INTEGER     NOT NULL DEFAULT 5,
    title_win_bonus              INTEGER     NOT NULL DEFAULT 10,
    title_defense_bonus          INTEGER     NOT NULL DEFAULT 5,
    cost_fluctuation_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    cost_change_per_win          INTEGER     NOT NULL DEFAULT 10,
    cost_change_per_loss         INTEGER     NOT NULL DEFAULT 5,
    cost_reset_strategy          cost_reset_strategy NOT NULL DEFAULT 'reset',
    underdog_multiplier          NUMERIC(4,2) NOT NULL DEFAULT 1.5,
    perfect_pick_bonus           INTEGER     NOT NULL DEFAULT 50,
    streak_bonus_threshold       INTEGER     NOT NULL DEFAULT 5,
    streak_bonus_points          INTEGER     NOT NULL DEFAULT 25,
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE site_config (
    config_key   TEXT        PRIMARY KEY,
    features     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE divisions (
    division_id   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT          NOT NULL UNIQUE,
    description   TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE stipulations (
    stipulation_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT          NOT NULL UNIQUE,
    description     TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE match_types (
    match_type_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT          NOT NULL UNIQUE,
    description    TEXT,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE companies (
    company_id    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT          NOT NULL,
    abbreviation  TEXT,
    image_url     TEXT,
    description   TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE shows (
    show_id       UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT             NOT NULL,
    company_id    UUID             NOT NULL REFERENCES companies (company_id) ON DELETE RESTRICT,
    description   TEXT,
    schedule      show_schedule,
    day_of_week   day_of_week,
    image_url     TEXT,
    created_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — identity & roster
-- ─────────────────────────────────────────────────────────────────────────────

-- Players. Extended from plan-017's version to carry the real columns the app
-- uses today. `stable_id` and `tag_team_id` FKs are declared AFTER those tables
-- are created (end of file) to avoid circular create order.
CREATE TABLE players (
    player_id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            TEXT,  -- Cognito sub; not a FK (no users table yet)
    name               TEXT             NOT NULL,
    current_wrestler   TEXT,
    alternate_wrestler TEXT,
    image_url          TEXT,
    psn_id             TEXT,
    alignment          player_alignment,
    division_id        UUID             REFERENCES divisions (division_id) ON DELETE SET NULL,
    stable_id          UUID,  -- FK added at end of file
    tag_team_id        UUID,  -- FK added at end of file
    created_at         TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ      NOT NULL DEFAULT now()
    -- No wins/losses/draws. Derive from match_participants.
    -- No main_overall. Derive from wrestler_overalls.
);

CREATE UNIQUE INDEX players_user_id_unique ON players (user_id) WHERE user_id IS NOT NULL;

-- Tag teams. player1_id/player2_id are FKs to players, declared after players exists.
CREATE TABLE tag_teams (
    tag_team_id   UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT             NOT NULL,
    player1_id    UUID             NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    player2_id    UUID             NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    image_url     TEXT,
    status        tag_team_status  NOT NULL DEFAULT 'pending_partner',
    dissolved_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CHECK (player1_id <> player2_id)
);

-- Stables. leader_id is a FK to players.
CREATE TABLE stables (
    stable_id     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT            NOT NULL,
    leader_id     UUID            NOT NULL REFERENCES players (player_id) ON DELETE RESTRICT,
    image_url     TEXT,
    status        stable_status   NOT NULL DEFAULT 'pending',
    disbanded_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Junction: stable_members. Replaces the Dynamo `memberIds` array.
-- The leader is stored as a member with role='leader'.
CREATE TABLE stable_members (
    stable_id   UUID         NOT NULL REFERENCES stables (stable_id) ON DELETE CASCADE,
    player_id   UUID         NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    role        TEXT         NOT NULL DEFAULT 'member',  -- 'leader' | 'member'
    joined_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (stable_id, player_id)
);

CREATE TABLE stable_invitations (
    invitation_id          UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    stable_id              UUID                       NOT NULL REFERENCES stables (stable_id) ON DELETE CASCADE,
    invited_player_id      UUID                       NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    invited_by_player_id   UUID                       NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    status                 stable_invitation_status   NOT NULL DEFAULT 'pending',
    message                TEXT,
    expires_at             TIMESTAMPTZ                NOT NULL,
    created_at             TIMESTAMPTZ                NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ                NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — seasons, championships
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — tournaments, events, matches
-- ─────────────────────────────────────────────────────────────────────────────

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
);

CREATE TABLE events (
    event_id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name                         TEXT          NOT NULL,
    event_type                   event_type    NOT NULL,
    date                         TIMESTAMPTZ   NOT NULL,
    venue                        TEXT,
    description                  TEXT,
    image_url                    TEXT,
    theme_color                  TEXT,
    status                       event_status  NOT NULL DEFAULT 'upcoming',
    season_id                    UUID          REFERENCES seasons (season_id) ON DELETE SET NULL,
    show_id                      UUID          REFERENCES shows (show_id)     ON DELETE SET NULL,
    attendance                   INTEGER,
    rating                       NUMERIC(3,1),
    fantasy_enabled              BOOLEAN       NOT NULL DEFAULT FALSE,
    fantasy_locked               BOOLEAN       NOT NULL DEFAULT FALSE,
    fantasy_budget               INTEGER,
    fantasy_picks_per_division   INTEGER,
    created_at                   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Junction for events.companyIds (an array in Dynamo).
CREATE TABLE event_companies (
    event_id    UUID NOT NULL REFERENCES events    (event_id)    ON DELETE CASCADE,
    company_id  UUID NOT NULL REFERENCES companies (company_id)  ON DELETE CASCADE,
    PRIMARY KEY (event_id, company_id)
);

CREATE TABLE matches (
    match_id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    date                   TIMESTAMPTZ    NOT NULL,
    match_type             match_type     NOT NULL,  -- will become match_type_id FK during Phase 4 rewrite
    stipulation            TEXT,                     -- will become stipulation_id FK during Phase 4 rewrite
    is_championship        BOOLEAN        NOT NULL DEFAULT FALSE,
    is_title_defense       BOOLEAN        NOT NULL DEFAULT FALSE,
    is_draw                BOOLEAN        NOT NULL DEFAULT FALSE,
    championship_id        UUID           REFERENCES championships (championship_id) ON DELETE SET NULL,
    season_id              UUID           REFERENCES seasons       (season_id)       ON DELETE SET NULL,
    tournament_id          UUID           REFERENCES tournaments   (tournament_id)   ON DELETE SET NULL,
    event_id               UUID           REFERENCES events        (event_id)        ON DELETE SET NULL,
    challenge_id           UUID,  -- FK added at end of file
    promo_id               UUID,  -- FK added at end of file
    winning_team_index     INTEGER,
    star_rating            NUMERIC(2,1),
    match_of_the_night     BOOLEAN        NOT NULL DEFAULT FALSE,
    status                 match_status   NOT NULL DEFAULT 'scheduled',
    created_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE match_participants (
    match_id     UUID                 NOT NULL REFERENCES matches (match_id) ON DELETE CASCADE,
    player_id    UUID                 NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    outcome      participant_outcome  NOT NULL DEFAULT 'pending',
    team_index   INTEGER,  -- 0 or 1 (or higher) for tag/multi-team matches; NULL for singles
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
    player_id  UUID  NOT NULL REFERENCES players            (player_id) ON DELETE CASCADE,
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
    event_id      UUID     NOT NULL REFERENCES events  (event_id)  ON DELETE CASCADE,
    match_id      UUID     NOT NULL REFERENCES matches (match_id)  ON DELETE CASCADE,
    position      INTEGER  NOT NULL,
    designation   TEXT,    -- 'pre-show' | 'opener' | 'midcard' | 'co-main' | 'main-event'
    notes         TEXT,
    PRIMARY KEY (event_id, match_id)
);

CREATE TABLE event_check_ins (
    event_id        UUID                       NOT NULL REFERENCES events  (event_id)  ON DELETE CASCADE,
    player_id       UUID                       NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    status          event_check_in_status      NOT NULL,
    checked_in_at   TIMESTAMPTZ                NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,  -- replaces Dynamo TTL; app-side cleanup or cron job
    PRIMARY KEY (event_id, player_id)
);

CREATE INDEX event_check_ins_player_idx ON event_check_ins (player_id);

CREATE TABLE season_awards (
    award_id      UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id     UUID               NOT NULL REFERENCES seasons (season_id) ON DELETE CASCADE,
    name          TEXT               NOT NULL,
    award_type    season_award_type  NOT NULL,
    player_id     UUID               NOT NULL REFERENCES players (player_id) ON DELETE RESTRICT,
    description   TEXT,
    value         TEXT,
    created_at    TIMESTAMPTZ        NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — contenders
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE contender_rankings (
    championship_id      UUID           NOT NULL REFERENCES championships (championship_id) ON DELETE CASCADE,
    player_id            UUID           NOT NULL REFERENCES players        (player_id)       ON DELETE CASCADE,
    rank                 INTEGER        NOT NULL,
    ranking_score        NUMERIC(8,2)   NOT NULL DEFAULT 0,
    win_percentage       NUMERIC(5,4)   NOT NULL DEFAULT 0,
    current_streak       INTEGER        NOT NULL DEFAULT 0,
    quality_score        NUMERIC(8,2)   NOT NULL DEFAULT 0,
    recency_score        NUMERIC(8,2)   NOT NULL DEFAULT 0,
    matches_in_period    INTEGER        NOT NULL DEFAULT 0,
    wins_in_period       INTEGER        NOT NULL DEFAULT 0,
    previous_rank        INTEGER,
    peak_rank            INTEGER        NOT NULL DEFAULT 1,
    weeks_at_top         INTEGER        NOT NULL DEFAULT 0,
    calculated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
    PRIMARY KEY (championship_id, player_id)
);

CREATE INDEX contender_rankings_rank_idx ON contender_rankings (championship_id, rank);

CREATE TABLE contender_overrides (
    championship_id   UUID                      NOT NULL REFERENCES championships (championship_id) ON DELETE CASCADE,
    player_id         UUID                      NOT NULL REFERENCES players        (player_id)       ON DELETE CASCADE,
    override_type     contender_override_type   NOT NULL,
    reason            TEXT                      NOT NULL,
    created_by        TEXT                      NOT NULL,
    expires_at        TIMESTAMPTZ,
    active            BOOLEAN                   NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ               NOT NULL DEFAULT now(),
    PRIMARY KEY (championship_id, player_id)
);

CREATE INDEX contender_overrides_active_idx ON contender_overrides (championship_id, active, created_at);

CREATE TABLE ranking_history (
    player_id        UUID           NOT NULL REFERENCES players        (player_id)       ON DELETE CASCADE,
    week_key         TEXT           NOT NULL,  -- '{championshipId}#{YYYY-WW}' — preserved from Dynamo shape
    championship_id  UUID           NOT NULL REFERENCES championships (championship_id) ON DELETE CASCADE,
    rank             INTEGER        NOT NULL,
    ranking_score    NUMERIC(8,2)   NOT NULL DEFAULT 0,
    movement         INTEGER        NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, week_key)
);

CREATE INDEX ranking_history_championship_week_idx ON ranking_history (championship_id, week_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — fantasy
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE wrestler_overalls (
    player_id            UUID           PRIMARY KEY REFERENCES players (player_id) ON DELETE CASCADE,
    main_overall         INTEGER        NOT NULL,
    alternate_overall    INTEGER,
    submitted_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE wrestler_costs (
    player_id           UUID           PRIMARY KEY REFERENCES players (player_id) ON DELETE CASCADE,
    base_cost           INTEGER        NOT NULL,
    current_cost        INTEGER        NOT NULL,
    win_rate_30_days    INTEGER        NOT NULL DEFAULT 0,
    recent_record       TEXT,
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Junction: cost history. Replaces Dynamo's inline `costHistory` array.
CREATE TABLE wrestler_cost_history (
    player_id        UUID           NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    effective_date   DATE           NOT NULL,
    cost             INTEGER        NOT NULL,
    reason           TEXT,
    PRIMARY KEY (player_id, effective_date)
);

CREATE TABLE fantasy_picks (
    event_id           UUID           NOT NULL REFERENCES events (event_id) ON DELETE CASCADE,
    fantasy_user_id    TEXT           NOT NULL,  -- Cognito fantasy user sub
    total_spent        INTEGER        NOT NULL DEFAULT 0,
    points_earned      INTEGER,
    breakdown          JSONB,
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, fantasy_user_id)
);

CREATE INDEX fantasy_picks_user_idx ON fantasy_picks (fantasy_user_id);

-- Junction: fantasy_pick_items. Replaces Dynamo's `picks` map (divisionId → playerIds).
CREATE TABLE fantasy_pick_items (
    event_id          UUID           NOT NULL,
    fantasy_user_id   TEXT           NOT NULL,
    division_id       UUID           NOT NULL REFERENCES divisions (division_id) ON DELETE CASCADE,
    player_id         UUID           NOT NULL REFERENCES players   (player_id)   ON DELETE CASCADE,
    PRIMARY KEY (event_id, fantasy_user_id, division_id, player_id),
    FOREIGN KEY (event_id, fantasy_user_id) REFERENCES fantasy_picks (event_id, fantasy_user_id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — challenges
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE challenges (
    challenge_id             UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id            UUID               NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    challenged_id            UUID               NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    match_type               TEXT               NOT NULL,
    stipulation              TEXT,
    championship_id          UUID               REFERENCES championships (championship_id) ON DELETE SET NULL,
    message                  TEXT,
    status                   challenge_status   NOT NULL DEFAULT 'pending',
    response_message         TEXT,
    countered_challenge_id   UUID               REFERENCES challenges (challenge_id) ON DELETE SET NULL,
    match_id                 UUID               REFERENCES matches (match_id) ON DELETE SET NULL,
    challenge_mode           challenge_mode     NOT NULL DEFAULT 'singles',
    challenger_tag_team_id   UUID               REFERENCES tag_teams (tag_team_id) ON DELETE SET NULL,
    challenged_tag_team_id   UUID               REFERENCES tag_teams (tag_team_id) ON DELETE SET NULL,
    expires_at               TIMESTAMPTZ        NOT NULL,
    created_at               TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX challenges_challenger_idx ON challenges (challenger_id, created_at);
CREATE INDEX challenges_challenged_idx ON challenges (challenged_id, created_at);
CREATE INDEX challenges_status_idx     ON challenges (status, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — promos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE promos (
    promo_id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id                  UUID           NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    promo_type                 promo_type     NOT NULL,
    title                      TEXT,
    content                    TEXT           NOT NULL,
    target_player_id           UUID           REFERENCES players       (player_id)       ON DELETE SET NULL,
    target_promo_id            UUID           REFERENCES promos        (promo_id)        ON DELETE SET NULL,
    match_id                   UUID           REFERENCES matches       (match_id)        ON DELETE SET NULL,
    championship_id            UUID           REFERENCES championships (championship_id) ON DELETE SET NULL,
    image_url                  TEXT,
    challenge_mode             challenge_mode,
    challenger_tag_team_name   TEXT,
    target_tag_team_name       TEXT,
    is_pinned                  BOOLEAN        NOT NULL DEFAULT FALSE,
    is_hidden                  BOOLEAN        NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX promos_player_idx ON promos (player_id, created_at);
CREATE INDEX promos_type_idx   ON promos (promo_type, created_at);

-- Junction: promo_reactions. Replaces the Dynamo reactions map (userId → reactionType).
-- user_id is a Cognito sub (text) rather than a FK to players, since reactors
-- may be fantasy-mode users with no Player row.
CREATE TABLE promo_reactions (
    promo_id       UUID                  NOT NULL REFERENCES promos (promo_id) ON DELETE CASCADE,
    user_id        TEXT                  NOT NULL,
    reaction_type  promo_reaction_type   NOT NULL,
    created_at     TIMESTAMPTZ           NOT NULL DEFAULT now(),
    PRIMARY KEY (promo_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — announcements, notifications, videos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE announcements (
    announcement_id   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    title             TEXT          NOT NULL,
    body              TEXT          NOT NULL,
    created_by        TEXT          NOT NULL,
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    priority          INTEGER       NOT NULL DEFAULT 1,  -- 1=low, 2=medium, 3=high
    expires_at        TIMESTAMPTZ,
    video_url         TEXT,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (priority BETWEEN 1 AND 3)
);

CREATE INDEX announcements_active_idx ON announcements (is_active, created_at);

CREATE TABLE notifications (
    notification_id   UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           TEXT                       NOT NULL,  -- Cognito sub; not a FK
    type              notification_type          NOT NULL,
    message           TEXT                       NOT NULL,
    source_id         TEXT                       NOT NULL,
    source_type       notification_source_type   NOT NULL,
    is_read           BOOLEAN                    NOT NULL DEFAULT FALSE,
    expires_at        TIMESTAMPTZ,  -- replaces Dynamo TTL; cleanup via cron
    created_at        TIMESTAMPTZ                NOT NULL DEFAULT now()
);

-- The "unread notifications for user X" query is frequent.
CREATE INDEX notifications_user_unread_idx
    ON notifications (user_id, created_at DESC)
    WHERE is_read = FALSE;

CREATE INDEX notifications_user_all_idx ON notifications (user_id, created_at DESC);

CREATE TABLE videos (
    video_id        UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT              NOT NULL,
    description     TEXT              NOT NULL DEFAULT '',
    video_url       TEXT              NOT NULL,
    thumbnail_url   TEXT,
    category        video_category    NOT NULL,
    is_published    BOOLEAN           NOT NULL DEFAULT FALSE,
    uploaded_by     TEXT              NOT NULL,
    created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- Junction: video_tags. Replaces Dynamo's `tags` array.
CREATE TABLE video_tags (
    video_id   UUID  NOT NULL REFERENCES videos (video_id) ON DELETE CASCADE,
    tag        TEXT  NOT NULL,
    PRIMARY KEY (video_id, tag)
);

CREATE INDEX videos_published_idx ON videos (is_published, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables — transfers, storylines, matchmaking
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE transfer_requests (
    request_id          UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id           UUID                       NOT NULL REFERENCES players   (player_id)   ON DELETE CASCADE,
    from_division_id    UUID                       NOT NULL REFERENCES divisions (division_id) ON DELETE RESTRICT,
    to_division_id      UUID                       NOT NULL REFERENCES divisions (division_id) ON DELETE RESTRICT,
    reason              TEXT                       NOT NULL,
    status              transfer_request_status    NOT NULL DEFAULT 'pending',
    reviewed_by         TEXT,
    review_note         TEXT,
    created_at          TIMESTAMPTZ                NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ                NOT NULL DEFAULT now(),
    CHECK (from_division_id <> to_division_id)
);

CREATE INDEX transfer_requests_player_idx ON transfer_requests (player_id);
CREATE INDEX transfer_requests_status_idx ON transfer_requests (status);

CREATE TABLE storyline_requests (
    request_id      UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id    UUID                        NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    request_type    storyline_request_type      NOT NULL,
    description     TEXT                        NOT NULL,
    status          storyline_request_status    NOT NULL DEFAULT 'pending',
    gm_note         TEXT,
    reviewed_by     TEXT,
    created_at      TIMESTAMPTZ                 NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ                 NOT NULL DEFAULT now()
);

CREATE INDEX storyline_requests_requester_idx ON storyline_requests (requester_id, created_at);
CREATE INDEX storyline_requests_status_idx    ON storyline_requests (status, created_at);

-- Junction for storyline_requests.target_player_ids array.
CREATE TABLE storyline_request_targets (
    request_id   UUID  NOT NULL REFERENCES storyline_requests (request_id) ON DELETE CASCADE,
    player_id    UUID  NOT NULL REFERENCES players            (player_id)  ON DELETE CASCADE,
    PRIMARY KEY (request_id, player_id)
);

-- Matchmaking queue: one row per player currently in queue.
-- Uses players(player_id) FK but with ON DELETE CASCADE so leaving the league cleans up.
CREATE TABLE matchmaking_queue (
    player_id       UUID           PRIMARY KEY REFERENCES players (player_id) ON DELETE CASCADE,
    match_format    TEXT,
    stipulation_id  UUID           REFERENCES stipulations (stipulation_id) ON DELETE SET NULL,
    joined_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ    NOT NULL  -- replaces Dynamo TTL; cleanup via cron
);

CREATE INDEX matchmaking_queue_joined_idx ON matchmaking_queue (joined_at);

CREATE TABLE match_invitations (
    invitation_id    UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    from_player_id   UUID                       NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    to_player_id     UUID                       NOT NULL REFERENCES players (player_id) ON DELETE CASCADE,
    match_format     TEXT,
    stipulation_id   UUID                       REFERENCES stipulations (stipulation_id) ON DELETE SET NULL,
    status           match_invitation_status    NOT NULL DEFAULT 'pending',
    expires_at       TIMESTAMPTZ                NOT NULL,
    created_at       TIMESTAMPTZ                NOT NULL DEFAULT now()
);

CREATE INDEX match_invitations_to_player_idx   ON match_invitations (to_player_id,   created_at);
CREATE INDEX match_invitations_from_player_idx ON match_invitations (from_player_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Late-bound foreign keys (for circular dependencies)
-- ─────────────────────────────────────────────────────────────────────────────

-- players ↔ stables / tag_teams: mutual references resolved here.
ALTER TABLE players
    ADD CONSTRAINT players_stable_id_fk
    FOREIGN KEY (stable_id) REFERENCES stables (stable_id) ON DELETE SET NULL;

ALTER TABLE players
    ADD CONSTRAINT players_tag_team_id_fk
    FOREIGN KEY (tag_team_id) REFERENCES tag_teams (tag_team_id) ON DELETE SET NULL;

-- matches ↔ challenges / promos: added here so matches can be created before
-- the referenced challenge/promo rows exist at insert time.
ALTER TABLE matches
    ADD CONSTRAINT matches_challenge_id_fk
    FOREIGN KEY (challenge_id) REFERENCES challenges (challenge_id) ON DELETE SET NULL;

ALTER TABLE matches
    ADD CONSTRAINT matches_promo_id_fk
    FOREIGN KEY (promo_id) REFERENCES promos (promo_id) ON DELETE SET NULL;
