import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { matchesApi, matchTypesApi, playersApi, stipulationsApi } from '../../services/api';
import type { MatchType, Player, SimulatePreviewResponse, Stipulation } from '../../types';
import Button from '../ui/Button';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import SimResultPanel from '../sim/SimResultPanel';
import { sidesFromOdds } from '../sim/simSides';
import AdminNotice from './AdminNotice';
import SourceLoadNotice from './SourceLoadNotice';
import { settleSources } from './loadSources';
import './adminRoster.css';
import './MatchSimulator.css';

/** The simulator offers 2–4 sides of 1–4 wrestlers (the API takes up to 8 sides). */
export const SIMULATOR_MIN_SIDES = 2;
export const SIMULATOR_MAX_SIDES = 4;
export const SIMULATOR_MAX_MEMBERS = 4;

const SIMULATOR_SOURCES = {
  players: () => playersApi.getAll(),
  stipulations: () => stipulationsApi.getAll(),
  matchTypes: () => matchTypesApi.getAll(),
};

type SimulatorSource = keyof typeof SIMULATOR_SOURCES;

const emptySides = (): string[][] => [[''], ['']];

/**
 * Admin → Match Simulator (BLD-14). GMs pick 2–4 sides and a stipulation or
 * match type and preview the sim: odds, specialty hits and a play-by-play.
 * Nothing is recorded. The admin route guard keeps it to Moderators and Admins.
 */
export default function MatchSimulator() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedSources, setFailedSources] = useState<SimulatorSource[]>([]);

  const [sides, setSides] = useState<string[][]>(emptySides);
  const [stipulationId, setStipulationId] = useState('');
  const [matchTypeId, setMatchTypeId] = useState('');
  const [result, setResult] = useState<SimulatePreviewResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { values, failed } = await settleSources(SIMULATOR_SOURCES);
    if (values.players) setPlayers([...values.players].sort((a, b) => a.name.localeCompare(b.name)));
    if (values.stipulations) setStipulations(values.stipulations);
    if (values.matchTypes) setMatchTypes(values.matchTypes);
    setFailedSources(failed);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const playersById = useMemo(() => new Map(players.map((player) => [player.playerId, player])), [players]);
  const nameOf = useCallback(
    (playerId: string) => {
      const player = playersById.get(playerId);
      if (!player) return t('common.unknown');
      return player.currentWrestler || player.name;
    },
    [playersById, t],
  );

  const picked = sides.flat().filter(Boolean);
  const ready = picked.length === sides.flat().length && new Set(picked).size === picked.length;

  const updateSides = (next: string[][]) => {
    setSides(next);
    setResult(null);
  };

  const setMember = (sideIndex: number, memberIndex: number, playerId: string) => {
    updateSides(sides.map((side, index) => (
      index === sideIndex ? side.map((member, position) => (position === memberIndex ? playerId : member)) : side
    )));
  };

  const addMember = (sideIndex: number) => {
    updateSides(sides.map((side, index) => (index === sideIndex ? [...side, ''] : side)));
  };

  const removeMember = (sideIndex: number, memberIndex: number) => {
    updateSides(sides.map((side, index) => (
      index === sideIndex ? side.filter((_, position) => position !== memberIndex) : side
    )));
  };

  const addSide = () => updateSides([...sides, ['']]);
  const removeSide = (sideIndex: number) => updateSides(sides.filter((_, index) => index !== sideIndex));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || running) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await matchesApi.simulate({
        sides,
        ...(stipulationId ? { stipulationId } : {}),
        ...(matchTypeId ? { matchTypeId } : {}),
      }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('sim.actions.previewError'));
    } finally {
      setRunning(false);
    }
  };

  const playerLabel = (player: Player) => (
    player.currentWrestler ? `${player.currentWrestler} (${player.name})` : player.name
  );

  return (
    <div className="ar-page match-simulator">
      <PageHeader title={t('sim.simulator.title')} subtitle={t('sim.simulator.description')} />

      <SourceLoadNotice failed={failedSources} onRetry={loadData} retrying={loading} />
      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {loading ? (
        <Skeleton variant="block" count={3} />
      ) : (
        <form className="ar-form match-simulator__form" onSubmit={handleSubmit}>
          <div className="match-simulator__sides">
            {sides.map((side, sideIndex) => (
              <fieldset key={sideIndex} className="match-simulator__side">
                <legend className="ar-field__label">{t('sim.simulator.side', { number: sideIndex + 1 })}</legend>
                {side.map((playerId, memberIndex) => {
                  const controlId = `sim-side-${sideIndex}-member-${memberIndex}`;
                  return (
                    <div key={memberIndex} className="match-simulator__member">
                      <label htmlFor={controlId} className="sr-only">
                        {t('sim.simulator.memberLabel', { side: sideIndex + 1, member: memberIndex + 1 })}
                      </label>
                      <select
                        id={controlId}
                        className="ar-input"
                        value={playerId}
                        onChange={(event) => setMember(sideIndex, memberIndex, event.target.value)}
                      >
                        <option value="">{t('sim.simulator.pickWrestler')}</option>
                        {players.map((player) => (
                          <option
                            key={player.playerId}
                            value={player.playerId}
                            disabled={player.playerId !== playerId && picked.includes(player.playerId)}
                          >
                            {playerLabel(player)}
                          </option>
                        ))}
                      </select>
                      {side.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon={<X size={16} aria-hidden="true" />}
                          aria-label={t('sim.simulator.removeMember', { side: sideIndex + 1, member: memberIndex + 1 })}
                          onClick={() => removeMember(sideIndex, memberIndex)}
                        />
                      )}
                    </div>
                  );
                })}
                <div className="match-simulator__side-actions">
                  {side.length < SIMULATOR_MAX_MEMBERS && (
                    <Button type="button" variant="ghost" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={() => addMember(sideIndex)}>
                      {t('sim.simulator.addPartner')}
                    </Button>
                  )}
                  {sides.length > SIMULATOR_MIN_SIDES && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeSide(sideIndex)}>
                      {t('sim.simulator.removeSide')}
                    </Button>
                  )}
                </div>
              </fieldset>
            ))}
          </div>

          {sides.length < SIMULATOR_MAX_SIDES && (
            <div>
              <Button type="button" variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={addSide}>
                {t('sim.simulator.addSide')}
              </Button>
            </div>
          )}

          <div className="ar-form__grid">
            <div className="ar-field">
              <label htmlFor="sim-stipulation" className="ar-field__label">{t('sim.simulator.stipulation')}</label>
              <select
                id="sim-stipulation"
                className="ar-input"
                value={stipulationId}
                onChange={(event) => { setStipulationId(event.target.value); setResult(null); }}
              >
                <option value="">{t('sim.simulator.noStipulation')}</option>
                {stipulations.map((stipulation) => (
                  <option key={stipulation.stipulationId} value={stipulation.stipulationId}>{stipulation.name}</option>
                ))}
              </select>
            </div>
            <div className="ar-field">
              <label htmlFor="sim-match-type" className="ar-field__label">{t('sim.simulator.matchType')}</label>
              <select
                id="sim-match-type"
                className="ar-input"
                value={matchTypeId}
                onChange={(event) => { setMatchTypeId(event.target.value); setResult(null); }}
              >
                <option value="">{t('sim.simulator.anyMatchType')}</option>
                {matchTypes.map((matchType) => (
                  <option key={matchType.matchTypeId} value={matchType.matchTypeId}>{matchType.name}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="ar-hint">{t('sim.simulator.hint')}</p>

          <div className="match-simulator__submit">
            <Button type="submit" disabled={!ready} loading={running}>
              {result ? t('sim.actions.previewAgain') : t('sim.actions.preview')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { updateSides(emptySides()); setStipulationId(''); setMatchTypeId(''); }}>
              {t('sim.simulator.reset')}
            </Button>
          </div>
        </form>
      )}

      {result && (
        <div className="match-simulator__result">
          <p className="ar-hint">{t('sim.actions.previewNote')}</p>
          <SimResultPanel
            sides={sidesFromOdds(result.probabilities, nameOf)}
            category={result.category}
            winnerSideId={result.winnerSideId}
            specialtyHits={result.specialtyHits}
            conditions={result.conditions}
            playByPlay={result.playByPlay}
            seed={result.seed}
          />
        </div>
      )}
    </div>
  );
}
