# Plan: Postgres (Neon) Implementation

> Implements the Postgres driver for the repository interfaces established in
> the [Database Interface Layer plan](plan-database-interface-layer.md).
> The interface layer is complete — this plan adds `backend/lib/repositories/postgres/*.ts`
> and registers the driver. Zero handler changes required.

## Context

The repository pattern migration (Waves 1–9b) is complete. Every handler under
`backend/functions/` imports from `backend/lib/repositories`, not from
`backend/lib/dynamodb`. The `getRepositories()` factory selects a driver based on
`process.env.DB_DRIVER` (`dynamo` | `memory` | `postgres`).

This plan:
1. Designs a relational schema that improves on DynamoDB's flat-table model
2. Implements `backend/lib/repositories/postgres/*.ts` for every repository interface
3. Registers the `postgres` driver
4. Provides migration scripts and a deployment strategy

**Target**: [Neon](https://neon.tech) serverless Postgres (connection pooling via
`@neondatabase/serverless`, compatible with standard `pg` when running locally).

## Goals and Non-Goals

**In scope**
- Relational schema design for all 27 repository interfaces
- Postgres implementations of every repository method
- `UnitOfWork` implementation using `BEGIN…COMMIT`
- Migration scripts (DDL) for schema creation
- Connection management for Lambda cold starts
- Local development with Docker Postgres
- Env-var–driven driver selection (`DB_DRIVER=postgres`)

**Out of scope**
- Removing the DynamoDB driver (it stays as the default/fallback)
- Changing any handler, test, or HTTP contract
- ORM adoption — hand-written SQL with a lightweight query builder (Kysely)
- Data migration from DynamoDB to Postgres (separate plan)

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Database | Neon (serverless Postgres 16) | Auto-scaling, branching for dev/preview, HTTP driver for Lambda |
| Query builder | [Kysely](https://kysely.dev) | Type-safe SQL builder, no ORM overhead, Neon adapter available |
| Driver (Lambda) | `@neondatabase/serverless` | HTTP-based, no TCP connection needed, ideal for short-lived Lambda |
| Driver (local) | `pg` via Kysely's `PostgresDialect` | Standard Postgres for Docker-based local dev |
| Migrations | Kysely Migrator or raw SQL files | Keep DDL in `backend/lib/repositories/postgres/migrations/` |

## Relational Schema Design

### Design Principles

1. **Proper foreign keys** — DynamoDB has no referential integrity. Postgres enforces it.
   Player → Division, Match → Season, Championship History → Championship, etc.
2. **Normalize where DynamoDB denormalized** — e.g., `memberIds[]` on Stables becomes a
   join table `stable_members`. `companyIds[]` on Events becomes `event_companies`.
3. **Use native Postgres types** — `TIMESTAMPTZ` instead of ISO strings, `BOOLEAN` instead
   of `'true'`/`'false'` strings, `JSONB` for semi-structured data (brackets, standings,
   reactions), `TEXT[]` for simple arrays (participants, tags).
4. **Computed columns via views/queries** — `wins`/`losses`/`draws` on Players can be
   computed from Matches instead of maintained as counters. But for performance, keep
   materialized counters and update them transactionally (matches the current behavior).
5. **Enums as Postgres enums** — `match_status`, `event_type`, `challenge_status`, etc.
6. **UUID primary keys** — same as DynamoDB, using `gen_random_uuid()`.

### Tables

#### Core Domain

```sql
-- Lookup tables
CREATE TABLE divisions (
  division_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stipulations (
  stipulation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE match_types (
  match_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Players
CREATE TABLE players (
  player_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT UNIQUE,              -- Cognito sub
  name              TEXT NOT NULL,
  current_wrestler  TEXT NOT NULL,
  alternate_wrestler TEXT,
  wins              INT NOT NULL DEFAULT 0,
  losses            INT NOT NULL DEFAULT 0,
  draws             INT NOT NULL DEFAULT 0,
  image_url         TEXT,
  psn_id            TEXT,
  division_id       UUID REFERENCES divisions(division_id) ON DELETE SET NULL,
  company_id        UUID REFERENCES companies(company_id) ON DELETE SET NULL,
  stable_id         UUID REFERENCES stables(stable_id) ON DELETE SET NULL,
  tag_team_id       UUID REFERENCES tag_teams(tag_team_id) ON DELETE SET NULL,
  alignment         TEXT CHECK (alignment IN ('face', 'heel', 'neutral')),
  main_overall      INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_user_id ON players(user_id);
CREATE INDEX idx_players_division ON players(division_id);
```

#### Matches & Results

```sql
CREATE TYPE match_status AS ENUM ('scheduled', 'completed', 'cancelled');

CREATE TABLE matches (
  match_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            TIMESTAMPTZ NOT NULL,
  match_format    TEXT,
  stipulation_id  UUID REFERENCES stipulations(stipulation_id),
  participants    UUID[] NOT NULL,            -- player IDs
  teams           UUID[][],                   -- for tag matches
  winners         UUID[],
  losers          UUID[],
  is_draw         BOOLEAN DEFAULT false,
  is_championship BOOLEAN DEFAULT false,
  championship_id UUID REFERENCES championships(championship_id),
  tournament_id   UUID REFERENCES tournaments(tournament_id),
  season_id       UUID REFERENCES seasons(season_id),
  event_id        UUID REFERENCES events(event_id),
  status          match_status NOT NULL DEFAULT 'scheduled',
  star_rating     NUMERIC(2,1) CHECK (star_rating BETWEEN 0.5 AND 5.0),
  match_of_the_night BOOLEAN DEFAULT false,
  is_title_defense   BOOLEAN,
  version         INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_season ON matches(season_id);
CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_matches_event ON matches(event_id);
CREATE INDEX idx_matches_date ON matches(date DESC);
```

#### Championships

```sql
CREATE TABLE championships (
  championship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('singles', 'tag')),
  current_champion UUID[],                   -- single or tag team player IDs
  image_url       TEXT,
  division_id     UUID REFERENCES divisions(division_id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  defenses        INT DEFAULT 0,
  version         INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE championship_history (
  championship_id UUID NOT NULL REFERENCES championships(championship_id) ON DELETE CASCADE,
  won_date        TIMESTAMPTZ NOT NULL,
  champion        UUID[] NOT NULL,           -- player ID(s)
  lost_date       TIMESTAMPTZ,
  days_held       INT,
  defenses        INT DEFAULT 0,
  match_id        UUID REFERENCES matches(match_id),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (championship_id, won_date)
);
```

#### Seasons & Standings

```sql
CREATE TYPE season_status AS ENUM ('active', 'completed');

CREATE TABLE seasons (
  season_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date   TIMESTAMPTZ,
  status     season_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE season_standings (
  season_id  UUID NOT NULL REFERENCES seasons(season_id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  wins       INT NOT NULL DEFAULT 0,
  losses     INT NOT NULL DEFAULT 0,
  draws      INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, player_id)
);

CREATE INDEX idx_standings_player ON season_standings(player_id);

CREATE TABLE season_awards (
  award_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      UUID NOT NULL REFERENCES seasons(season_id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  award_type     TEXT NOT NULL,
  player_id      UUID NOT NULL REFERENCES players(player_id),
  player_name    TEXT NOT NULL,
  description    TEXT,
  value          TEXT,
  auto_generated BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_awards_season ON season_awards(season_id);
```

#### Tournaments

```sql
CREATE TABLE tournaments (
  tournament_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('single-elimination', 'round-robin')),
  status        TEXT NOT NULL DEFAULT 'upcoming',
  participants  UUID[],
  brackets      JSONB,                       -- bracket tree (single-elim)
  standings     JSONB,                       -- { playerId: { wins, losses, draws, points } }
  winner        UUID,
  version       INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Events

```sql
CREATE TYPE event_type AS ENUM ('ppv', 'weekly', 'special', 'house');
CREATE TYPE event_status AS ENUM ('upcoming', 'in-progress', 'completed', 'cancelled');

CREATE TABLE events (
  event_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  event_type            event_type NOT NULL,
  date                  TIMESTAMPTZ NOT NULL,
  venue                 TEXT,
  description           TEXT,
  image_url             TEXT,
  theme_color           TEXT,
  status                event_status NOT NULL DEFAULT 'upcoming',
  season_id             UUID REFERENCES seasons(season_id),
  show_id               UUID REFERENCES shows(show_id),
  match_cards           JSONB NOT NULL DEFAULT '[]',
  attendance            INT,
  rating                NUMERIC(3,1),
  fantasy_enabled       BOOLEAN DEFAULT false,
  fantasy_locked        BOOLEAN DEFAULT false,
  fantasy_budget        INT,
  fantasy_picks_per_div INT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalized join table for event ↔ company (replaces companyIds[])
CREATE TABLE event_companies (
  event_id   UUID NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, company_id)
);

CREATE TABLE event_check_ins (
  event_id     UUID NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  player_id    UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('available', 'tentative', 'unavailable')),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, player_id)
);
```

#### Social & Community

```sql
-- Companies & Shows
CREATE TABLE companies (
  company_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  abbreviation TEXT,
  image_url    TEXT,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shows (
  show_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  company_id  UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  description TEXT,
  schedule    TEXT,
  day_of_week TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tag Teams
CREATE TABLE tag_teams (
  tag_team_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  player1_id   UUID NOT NULL REFERENCES players(player_id),
  player2_id   UUID NOT NULL REFERENCES players(player_id),
  image_url    TEXT,
  status       TEXT NOT NULL CHECK (status IN ('pending_partner','pending_admin','active','dissolved')),
  wins         INT NOT NULL DEFAULT 0,
  losses       INT NOT NULL DEFAULT 0,
  draws        INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  dissolved_at TIMESTAMPTZ
);

-- Stables (normalized: members in join table)
CREATE TABLE stables (
  stable_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  leader_id    UUID NOT NULL REFERENCES players(player_id),
  image_url    TEXT,
  status       TEXT NOT NULL CHECK (status IN ('pending','approved','active','disbanded')),
  wins         INT NOT NULL DEFAULT 0,
  losses       INT NOT NULL DEFAULT 0,
  draws        INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  disbanded_at TIMESTAMPTZ
);

-- Replaces memberIds[] array — proper many-to-many
CREATE TABLE stable_members (
  stable_id UUID NOT NULL REFERENCES stables(stable_id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  PRIMARY KEY (stable_id, player_id)
);

CREATE TABLE stable_invitations (
  invitation_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_id          UUID NOT NULL REFERENCES stables(stable_id) ON DELETE CASCADE,
  invited_player_id  UUID NOT NULL REFERENCES players(player_id),
  invited_by_player_id UUID NOT NULL REFERENCES players(player_id),
  status             TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','expired')),
  message            TEXT,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Challenges
CREATE TABLE challenges (
  challenge_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id       UUID NOT NULL REFERENCES players(player_id),
  challenged_id       UUID NOT NULL REFERENCES players(player_id),
  match_type          TEXT NOT NULL,
  stipulation         TEXT,
  championship_id     UUID REFERENCES championships(championship_id),
  message             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  response_message    TEXT,
  countered_challenge_id UUID REFERENCES challenges(challenge_id),
  match_id            UUID REFERENCES matches(match_id),
  challenge_mode      TEXT CHECK (challenge_mode IN ('singles', 'tag_team')),
  challenger_tag_team_id UUID REFERENCES tag_teams(tag_team_id),
  challenged_tag_team_id UUID REFERENCES tag_teams(tag_team_id),
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_challenges_status ON challenges(status);
CREATE INDEX idx_challenges_challenger ON challenges(challenger_id);
CREATE INDEX idx_challenges_challenged ON challenges(challenged_id);

-- Promos
CREATE TABLE promos (
  promo_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          UUID NOT NULL REFERENCES players(player_id),
  promo_type         TEXT NOT NULL,
  title              TEXT,
  content            TEXT NOT NULL,
  target_player_id   UUID REFERENCES players(player_id),
  target_promo_id    UUID REFERENCES promos(promo_id),
  match_id           UUID REFERENCES matches(match_id),
  championship_id    UUID REFERENCES championships(championship_id),
  image_url          TEXT,
  reactions          JSONB NOT NULL DEFAULT '{}',
  reaction_counts    JSONB NOT NULL DEFAULT '{}',
  is_pinned          BOOLEAN NOT NULL DEFAULT false,
  is_hidden          BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promos_player ON promos(player_id);
```

#### Content & Config

```sql
CREATE TABLE announcements (
  announcement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  priority        INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  expires_at      TIMESTAMPTZ,
  video_url       TEXT,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE videos (
  video_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  video_url     TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('match','highlight','promo','other')),
  tags          TEXT[] DEFAULT '{}',
  is_published  BOOLEAN NOT NULL DEFAULT false,
  uploaded_by   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  user_id         TEXT NOT NULL,
  notification_id UUID NOT NULL DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  link_url        TEXT,
  link_text       TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, created_at)
);

CREATE TABLE wrestler_overalls (
  player_id        UUID PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  main_overall     INT NOT NULL,
  alternate_overall INT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transfers (
  request_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      UUID NOT NULL REFERENCES players(player_id),
  from_division_id UUID NOT NULL REFERENCES divisions(division_id),
  to_division_id   UUID NOT NULL REFERENCES divisions(division_id),
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by    TEXT,
  review_note    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE storyline_requests (
  request_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id     UUID NOT NULL REFERENCES players(player_id),
  target_player_ids UUID[] NOT NULL,
  request_type     TEXT NOT NULL CHECK (request_type IN ('storyline','backstage_attack','rivalry')),
  description      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','declined')),
  gm_note          TEXT,
  reviewed_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Site config (key-value, single row expected)
CREATE TABLE site_config (
  config_key TEXT PRIMARY KEY DEFAULT 'GLOBAL',
  features   JSONB NOT NULL DEFAULT '{}'
);
```

#### Contenders & Fantasy

```sql
CREATE TABLE contender_rankings (
  championship_id UUID NOT NULL REFERENCES championships(championship_id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  rank            INT NOT NULL,
  ranking_score   NUMERIC NOT NULL,
  win_percentage  NUMERIC,
  current_streak  INT,
  quality_score   NUMERIC,
  recency_score   NUMERIC,
  matches_in_period INT,
  wins_in_period    INT,
  previous_rank   INT,
  peak_rank       INT,
  weeks_at_top    INT DEFAULT 0,
  is_overridden   BOOLEAN DEFAULT false,
  override_type   TEXT,
  organic_rank    INT,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (championship_id, player_id)
);

CREATE INDEX idx_rankings_rank ON contender_rankings(championship_id, rank);

CREATE TABLE contender_overrides (
  championship_id UUID NOT NULL REFERENCES championships(championship_id),
  player_id       UUID NOT NULL REFERENCES players(player_id),
  override_type   TEXT NOT NULL CHECK (override_type IN ('bump_to_top','send_to_bottom')),
  reason          TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT true,
  removed_at      TIMESTAMPTZ,
  removed_reason  TEXT,
  PRIMARY KEY (championship_id, player_id)
);

CREATE TABLE ranking_history (
  player_id       UUID NOT NULL REFERENCES players(player_id),
  week_key        TEXT NOT NULL,              -- "champId#YYYY-WW"
  championship_id UUID NOT NULL REFERENCES championships(championship_id),
  rank            INT NOT NULL,
  ranking_score   NUMERIC NOT NULL,
  movement        INT NOT NULL DEFAULT 0,
  is_overridden   BOOLEAN DEFAULT false,
  override_type   TEXT,
  organic_rank    INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, week_key)
);

CREATE TABLE fantasy_config (
  config_key TEXT PRIMARY KEY DEFAULT 'GLOBAL',
  config     JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE fantasy_picks (
  event_id        UUID NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  fantasy_user_id TEXT NOT NULL,
  username        TEXT,
  picks           JSONB NOT NULL DEFAULT '{}',
  total_spent     INT,
  points_earned   NUMERIC,
  breakdown       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, fantasy_user_id)
);

CREATE INDEX idx_picks_user ON fantasy_picks(fantasy_user_id);

CREATE TABLE wrestler_costs (
  player_id      UUID PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  current_cost   INT NOT NULL DEFAULT 100,
  base_cost      INT NOT NULL DEFAULT 100,
  cost_history   JSONB NOT NULL DEFAULT '[]',
  win_rate_30d   INT DEFAULT 0,
  recent_record  TEXT DEFAULT '0-0',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Matchmaking (ephemeral — could stay in DynamoDB/Redis)

```sql
CREATE TABLE matchmaking_presence (
  player_id    UUID PRIMARY KEY REFERENCES players(player_id),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl          TIMESTAMPTZ NOT NULL                  -- auto-cleanup via pg_cron
);

CREATE TABLE matchmaking_queue (
  player_id   UUID PRIMARY KEY REFERENCES players(player_id),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  preferences JSONB,
  ttl         TIMESTAMPTZ NOT NULL
);

CREATE TABLE match_invitations (
  invitation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_player_id UUID NOT NULL REFERENCES players(player_id),
  to_player_id   UUID NOT NULL REFERENCES players(player_id),
  match_format   TEXT,
  stipulation_id UUID REFERENCES stipulations(stipulation_id),
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ,
  accepted_at    TIMESTAMPTZ,
  ttl            TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_invitations_to ON match_invitations(to_player_id);
CREATE INDEX idx_invitations_from ON match_invitations(from_player_id);
```

### Key Schema Improvements Over DynamoDB

| Area | DynamoDB | Postgres |
|------|----------|----------|
| Referential integrity | None — orphaned references possible | Foreign keys with CASCADE |
| Boolean fields | `'true'`/`'false'` strings (for GSI) | Native `BOOLEAN` |
| Timestamps | ISO strings | `TIMESTAMPTZ` |
| Stable members | `memberIds[]` on stable record | `stable_members` join table |
| Event companies | `companyIds[]` on event record | `event_companies` join table |
| Announcement active | String `'true'`/`'false'` | Boolean `is_active` |
| Video published | String `'true'`/`'false'` | Boolean `is_published` |
| Transactions | 100-item limit, no read-your-writes | Full ACID with read-your-writes |
| Composite queries | Scan + client-side filter | SQL `WHERE` with indexes |
| TTL cleanup | DynamoDB TTL (eventual) | `pg_cron` scheduled cleanup |

## Implementation Steps

### Wave P1 — Setup & Connection (1 PR)

1. Add dependencies: `kysely`, `@neondatabase/serverless`, `pg` (dev)
2. Create `backend/lib/repositories/postgres/db.ts` — Kysely instance creation
   with connection pool, env-var config (`DATABASE_URL`), SSL settings
3. Create `backend/lib/repositories/postgres/types.ts` — Kysely table type
   definitions matching the schema above
4. Create migration files in `backend/lib/repositories/postgres/migrations/`
5. Add `DATABASE_URL` to `serverless.yml` environment
6. Add local Docker Postgres to development setup
7. Create migrate script: `backend/scripts/migrate-postgres.ts`

### Wave P2 — Simple CRUD Repositories (1 PR)

8. Implement the simplest repos first (same order as the DynamoDB migration):
   - `PostgresDivisionsRepository`
   - `PostgresStipulationsRepository`
   - `PostgresMatchTypesRepository`
   - `PostgresSiteConfigRepository`
   - `PostgresCompaniesRepository`
   - `PostgresShowsRepository`
9. Run contract tests against both Dynamo and Postgres drivers

### Wave P3 — Read-Heavy Repositories (1 PR)

10. Implement repos with more query patterns:
    - `PostgresSeasonsRepository`
    - `PostgresSeasonAwardsRepository`
    - `PostgresAnnouncementsRepository`
    - `PostgresVideosRepository`
    - `PostgresNotificationsRepository`
    - `PostgresOverallsRepository`
    - `PostgresSeasonStandingsRepository`

### Wave P4 — Complex Domains (1 PR)

11. Implement repos with relationships and GSI-equivalent queries:
    - `PostgresPlayersRepository`
    - `PostgresChallengesRepository`
    - `PostgresTagTeamsRepository`
    - `PostgresStablesRepository` (includes stable_members normalization)
    - `PostgresTransfersRepository`
    - `PostgresStorylineRequestsRepository`
    - `PostgresEventsRepository` (includes event_companies normalization)
    - `PostgresPromosRepository`

### Wave P5 — Aggregate Reads & Cross-Domain (1 PR)

12. Implement repos used by cross-aggregate handlers:
    - `PostgresMatchesRepository`
    - `PostgresChampionshipsRepository`
    - `PostgresTournamentsRepository`
    - `PostgresContendersRepository`
    - `PostgresFantasyRepository`
    - `PostgresMatchmakingRepository`

### Wave P6 — UnitOfWork & Transactions (1 PR)

13. Implement `PostgresUnitOfWork` using Kysely transactions:
    ```typescript
    async function createPostgresUnitOfWorkFactory(db: Kysely<Database>) {
      return async <T>(fn: (tx: UnitOfWork) => Promise<T>): Promise<T> => {
        return db.transaction().execute(async (trx) => {
          const uow = new PostgresUnitOfWork(trx);
          return fn(uow);
        });
      };
    }
    ```
    - Unlike DynamoDB's staged writes, Postgres UoW executes mutations
      immediately inside the transaction — reads see pending writes
    - No 100-item chunking needed — single `COMMIT`
    - This is strictly stronger than the DynamoDB semantics (the interface
      allows but does not require read-your-own-writes)

### Wave P7 — Admin Bulk Operations & Registration (1 PR)

14. Implement `clearAllData`, `exportAllData`, `importAllData` using
    `TRUNCATE CASCADE` and bulk `INSERT`
15. Register the `postgres` driver in `backend/lib/repositories/postgres/index.ts`
16. Wire into `backend/lib/repositories/index.ts` via `import './postgres'`
17. End-to-end test: `DB_DRIVER=postgres npm test`

### Wave P8 — Type Conversion Layer (1 PR)

18. The repository interfaces return domain types (camelCase, ISO strings,
    string booleans for some fields). Postgres uses snake_case, native types.
    Build a thin conversion layer in each repo:
    - `snake_case` ↔ `camelCase` field mapping
    - `TIMESTAMPTZ` → ISO string on read, ISO string → `Date` on write
    - `BOOLEAN` → `'true'`/`'false'` for fields where the domain type is string
      (Video.isPublished, Announcement.isActive) — or update domain types
    - `stable_members` join table → `memberIds[]` array on read

### Wave P9 — Deployment & Cutover (1 PR)

19. Neon project setup: create database, connection string
20. Add `DATABASE_URL` to devtest and prod stages in serverless.yml
21. Data migration script: read from DynamoDB via `exportAllData()`, transform,
    write to Postgres via `importAllData()`
22. Canary deployment: run both drivers in parallel, compare responses
23. Cutover: set `DB_DRIVER=postgres` in production environment

## Data Type Mapping

| Domain Type | DynamoDB | Postgres | Conversion |
|-------------|----------|----------|------------|
| IDs | String (UUID) | `UUID` | Direct |
| Timestamps | ISO 8601 string | `TIMESTAMPTZ` | `new Date(str)` ↔ `.toISOString()` |
| Booleans | `true`/`false` | `BOOLEAN` | Direct |
| String booleans | `'true'`/`'false'` | `BOOLEAN` | Parse on read, stringify on write |
| Arrays (IDs) | `L` (list) | `UUID[]` | Direct |
| Arrays (strings) | `L` (list) | `TEXT[]` | Direct |
| Nested objects | `M` (map) | `JSONB` | Direct (Kysely handles serialization) |
| Numbers | `N` | `INT`/`NUMERIC` | Direct |
| Enums | String | Postgres `ENUM` or `TEXT CHECK` | Direct |

## Risks & Mitigations

1. **Cold start latency**: Neon's HTTP driver avoids TCP handshake overhead.
   Kysely connection pooling reuses connections across warm Lambda invocations.
   Mitigation: benchmark cold starts; fall back to DynamoDB if >500ms added.

2. **Connection limits**: Neon's connection pooler (PgBouncer) handles this.
   Lambda concurrency of 100 with 1 connection each = 100 connections, well
   within Neon's limits.

3. **Schema drift**: Domain types in `types.ts` and Postgres DDL must stay
   in sync. Mitigation: Kysely's type-safe query builder catches mismatches
   at compile time. Contract tests catch behavioral drift.

4. **Array/JSONB performance**: Complex queries on `participants UUID[]` or
   `JSONB` fields may be slower than DynamoDB GSIs for specific access patterns.
   Mitigation: add GIN indexes where needed (`CREATE INDEX ... USING GIN`).

5. **Stable members normalization**: DynamoDB stores `memberIds[]` on the
   stable record. Postgres normalizes to `stable_members` join table. The
   Postgres repo must reconstruct `memberIds[]` on read and manage the join
   table on write. This is the trickiest type mapping.

6. **TTL for matchmaking**: DynamoDB has native TTL. Postgres needs a cron
   job to clean expired rows. Mitigation: use `pg_cron` extension on Neon
   or a scheduled Lambda.

## Success Criteria

- `DB_DRIVER=postgres npm test` passes all 953+ tests
- `DB_DRIVER=postgres npm run offline` serves the full app locally
- Zero handler changes needed — only `backend/lib/repositories/postgres/*.ts`
- Cold start overhead < 200ms (benchmark against DynamoDB baseline)
- Data migration script successfully transfers all production data
- Contract tests pass identically for both `dynamo` and `postgres` drivers
