/**
 * What of a stored official sim (BLD-10) the public may see.
 *
 * Anyone can see that a match was simulated and read its story: the
 * play-by-play, the category, specialty hits, the seed and the rules version.
 * The odds are a booking tool and stay with staff (BLD-08), as do the audit
 * fields (inputs digest, scaled builds, form window, who ran it). The run-in
 * beat shows who bought sim interference, which is private (ECO-08), so it is
 * left out of the public story (ECO-10).
 */
import type { MatchSimulation, MatchSimulationBeat } from '../repositories/types';

// ECO-10
/** Play-by-play beat type that is staff only. */
export const PRIVATE_BEAT_TYPES: readonly string[] = ['runIn'];

const isPublicBeat = (beat: MatchSimulationBeat): boolean =>
  !PRIVATE_BEAT_TYPES.includes(beat.key.split('.')[2] ?? '');

export type PublicMatchSimulation = Pick<
  MatchSimulation,
  'seed' | 'category' | 'rulesVersion' | 'winnerSideId' | 'playByPlay' | 'specialtyHits' | 'simulatedAt'
>;

export function toPublicMatchSimulation(simulation: MatchSimulation): PublicMatchSimulation {
  return {
    seed: simulation.seed,
    category: simulation.category,
    rulesVersion: simulation.rulesVersion,
    winnerSideId: simulation.winnerSideId,
    playByPlay: (simulation.playByPlay ?? []).filter(isPublicBeat),
    specialtyHits: simulation.specialtyHits,
    simulatedAt: simulation.simulatedAt,
  };
}

/**
 * A match row with its stored sim reduced to the public view. Rows without a
 * sim come back unchanged.
 */
export function withPublicSimulation<Row extends Record<string, unknown>>(row: Row): Row {
  const simulation = row.simulation as MatchSimulation | undefined;
  if (!simulation || typeof simulation !== 'object') return row;
  return { ...row, simulation: toPublicMatchSimulation(simulation) };
}
