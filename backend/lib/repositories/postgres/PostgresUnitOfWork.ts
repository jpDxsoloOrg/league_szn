import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { UnitOfWork, RecordDelta, UnitOfWorkFactory } from '../unitOfWork';
import type { DB } from './schema';
import { getKyselyDb } from './db';

type StagedOp = (trx: Transaction<DB>) => Promise<void>;

function notYet(method: string): never {
  throw new Error(
    `PostgresUnitOfWork.${method} is not implemented yet. ` +
      `The postgres driver currently supports roster-only mutations. ` +
      `Add a migration for the target aggregate before implementing.`,
  );
}

export class PostgresUnitOfWork implements UnitOfWork {
  private staged: StagedOp[] = [];
  private committed = false;

  constructor(private readonly trx: Transaction<DB>) {}

  // ─── players ───────────────────────────────────────────────────────

  updatePlayer(playerId: string, patch: Record<string, unknown>): void {
    this.staged.push(async (trx) => {
      // Match DynamoUnitOfWork semantics: undefined/null => REMOVE (set to NULL).
      const cols: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(patch)) {
        cols[camelToSnake(key)] = val === undefined ? null : val;
      }
      if (Object.keys(cols).length === 0) return;
      await trx
        .updateTable('players')
        .set({ ...cols, updated_at: sql`now()` })
        .where('player_id', '=', playerId)
        .execute();
    });
  }

  incrementPlayerRecord(playerId: string, delta: RecordDelta): void {
    this.staged.push(async (trx) => {
      const sets: Record<string, unknown> = { updated_at: sql`now()` };
      if (delta.wins) sets.wins = sql`wins + ${delta.wins}`;
      if (delta.losses) sets.losses = sql`losses + ${delta.losses}`;
      if (delta.draws) sets.draws = sql`draws + ${delta.draws}`;
      await trx
        .updateTable('players')
        .set(sets)
        .where('player_id', '=', playerId)
        .execute();
    });
  }

  clearPlayerField(playerId: string, field: string): void {
    this.staged.push(async (trx) => {
      const col = camelToSnake(field);
      await trx
        .updateTable('players')
        .set({ [col]: null, updated_at: sql`now()` })
        .where('player_id', '=', playerId)
        .execute();
    });
  }

  setPlayerTagTeamId(playerId: string, tagTeamId: string): void {
    this.staged.push(async (trx) => {
      // Condition: only set when tag_team_id is null (mirrors Dynamo's
      // attribute_not_exists condition). Fail loudly on violation.
      const res = await trx
        .updateTable('players')
        .set({ tag_team_id: tagTeamId, updated_at: sql`now()` })
        .where('player_id', '=', playerId)
        .where('tag_team_id', 'is', null)
        .executeTakeFirst();
      if (Number(res.numUpdatedRows) === 0) {
        throw new Error(
          `setPlayerTagTeamId condition failed: player ${playerId} already has a tag team`,
        );
      }
    });
  }

  // ─── tag teams ─────────────────────────────────────────────────────

  updateTagTeam(tagTeamId: string, patch: Record<string, unknown>): void {
    this.staged.push(async (trx) => {
      const cols: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(patch)) {
        cols[camelToSnake(key)] = val;
      }
      if (Object.keys(cols).length === 0) return;
      await trx
        .updateTable('tag_teams')
        .set({ ...cols, updated_at: sql`now()` })
        .where('tag_team_id', '=', tagTeamId)
        .execute();
    });
  }

  deleteTagTeam(tagTeamId: string): void {
    this.staged.push(async (trx) => {
      await trx
        .deleteFrom('tag_teams')
        .where('tag_team_id', '=', tagTeamId)
        .execute();
    });
  }

  // ─── wrestlers ─────────────────────────────────────────────────────

  assignWrestlerToPlayer(params: {
    wrestlerId: string;
    playerId: string;
    slot: 'primary' | 'alternate';
  }): void {
    this.staged.push(async (trx) => {
      await trx
        .updateTable('wrestlers')
        .set({
          is_in_use: true,
          assigned_player_id: params.playerId,
          assigned_slot: params.slot,
          updated_at: sql`now()`,
        })
        .where('wrestler_id', '=', params.wrestlerId)
        .execute();
    });
  }

  releaseWrestlerFromPlayer(params: { wrestlerId: string }): void {
    this.staged.push(async (trx) => {
      await trx
        .updateTable('wrestlers')
        .set({
          is_in_use: false,
          assigned_player_id: null,
          assigned_slot: null,
          updated_at: sql`now()`,
        })
        .where('wrestler_id', '=', params.wrestlerId)
        .execute();
    });
  }

  // ─── not-yet-implemented (tables don't exist in postgres driver yet) ──

  updateChampionship(): void { notYet('updateChampionship'); }
  removeChampion(): void { notYet('removeChampion'); }
  closeReign(): void { notYet('closeReign'); }
  startReign(): void { notYet('startReign'); }
  incrementDefenses(): void { notYet('incrementDefenses'); }
  updateChallenge(): void { notYet('updateChallenge'); }
  createChallenge(): void { notYet('createChallenge'); }
  incrementStanding(): void { notYet('incrementStanding'); }
  updateMatch(): void { notYet('updateMatch'); }

  // ─── commit / rollback ─────────────────────────────────────────────

  async commit(): Promise<void> {
    if (this.committed) throw new Error('UnitOfWork already committed');
    this.committed = true;
    for (const op of this.staged) {
      await op(this.trx);
    }
  }

  async rollback(): Promise<void> {
    this.staged = [];
    this.committed = true;
  }
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function createPostgresUnitOfWorkFactory(
  db: Kysely<DB> = getKyselyDb(),
): UnitOfWorkFactory {
  return async <T>(fn: (tx: UnitOfWork) => Promise<T>): Promise<T> => {
    return db.transaction().execute(async (trx) => {
      const uow = new PostgresUnitOfWork(trx);
      const result = await fn(uow);
      await uow.commit();
      return result;
    });
  };
}
