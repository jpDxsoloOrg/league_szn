import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Star } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import type { SimCategory } from '../../constants/simCategories';
import type { SimBeat, SimCondition } from '../../types';
import type { SimPanelSide } from './simSides';
import './SimResultPanel.css';

/** Time between two play-by-play lines while the story plays out. */
export const BEAT_REVEAL_MS = 900;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface SimOddsListProps {
  sides: SimPanelSide[];
  specialtyHits: string[];
  winnerSideId?: string;
  /** INJ-09: stamina and injury per player (staff only, injuries feature on). */
  conditions?: SimCondition[];
}

/**
 * Each side with its members, the "in specialty" marker, stamina and injury
 * markers (staff only) and, when the sides carry odds (staff only), a
 * win-chance bar.
 */
export function SimOddsList({ sides, specialtyHits, winnerSideId, conditions }: SimOddsListProps) {
  const { t } = useTranslation();
  const hitSet = new Set(specialtyHits);
  const conditionById = new Map((conditions ?? []).map((condition) => [condition.playerId, condition]));

  return (
    <ul className="sim-odds" aria-label={t('sim.panel.sidesLabel')}>
      {sides.map((side) => {
        const isWinner = side.sideId === winnerSideId;
        const showMembers = side.members.length > 1 || side.label !== side.members[0]?.name;
        return (
          <li key={side.sideId} className={`sim-odds__side${isWinner ? ' sim-odds__side--winner' : ''}`} data-testid={`sim-side-${side.sideId}`}>
            <div className="sim-odds__header">
              <span className="sim-odds__label">{side.label}</span>
              {isWinner && <Badge tone="win">{t('sim.panel.winner')}</Badge>}
              {side.pct !== undefined && (
                <span className="sim-odds__pct">{t('sim.panel.pct', { pct: side.pct })}</span>
              )}
            </div>
            {side.pct !== undefined && (
              <progress
                className="sim-odds__bar"
                value={side.pct}
                max={100}
                aria-label={t('sim.panel.oddsFor', { side: side.label, pct: side.pct })}
              />
            )}
            <ul className="sim-odds__members">
              {side.members.map((member) => {
                const condition = conditionById.get(member.playerId);
                return (
                  <li key={member.playerId} className="sim-odds__member">
                    {showMembers && <span>{member.name}</span>}
                    {hitSet.has(member.playerId) && (
                      <span className="sim-odds__specialty" title={t('sim.panel.specialtyHint')}>
                        <Star size={12} aria-hidden="true" />
                        {showMembers
                          ? t('sim.panel.inSpecialty')
                          : t('sim.panel.inSpecialtyNamed', { name: member.name })}
                      </span>
                    )}
                    {condition && (
                      <SimConditionMarkers condition={condition} name={showMembers ? undefined : member.name} />
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

interface SimConditionMarkersProps {
  condition: SimCondition;
  /** Set when the member's name is not shown next to the markers (singles). */
  name?: string;
}

/** INJ-09: a member's stamina and, when hurt, an injured marker. */
function SimConditionMarkers({ condition, name }: SimConditionMarkersProps) {
  const { t } = useTranslation();
  const values = { stamina: Math.round(condition.stamina), max: condition.maxStamina };
  return (
    <>
      <span className="sim-odds__stamina" title={t('sim.panel.conditionHint')}>
        <Activity size={12} aria-hidden="true" />
        {name ? t('sim.panel.staminaNamed', { name, ...values }) : t('sim.panel.stamina', values)}
      </span>
      {condition.injured && (
        <Badge tone="loss">{name ? t('sim.panel.injuredNamed', { name }) : t('sim.panel.injured')}</Badge>
      )}
    </>
  );
}

interface SimPlayByPlayProps {
  beats: SimBeat[];
}

/**
 * The match story, one line at a time. A skip button shows the rest at once;
 * with reduced motion everything shows straight away.
 */
export function SimPlayByPlay({ beats }: SimPlayByPlayProps) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? beats.length : Math.min(1, beats.length)));
  const done = shown >= beats.length;

  useEffect(() => {
    if (done) return undefined;
    const timer = window.setTimeout(() => setShown((count) => count + 1), BEAT_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [shown, done]);

  if (beats.length === 0) return null;

  return (
    <div className="sim-story">
      <div className="sim-story__header">
        <h4 className="sim-story__title">{t('sim.panel.playByPlay')}</h4>
        {!done && (
          <Button variant="ghost" size="sm" onClick={() => setShown(beats.length)}>
            {t('sim.panel.skip')}
          </Button>
        )}
      </div>
      <ol className="sim-story__beats" aria-live="polite">
        {beats.slice(0, shown).map((beat, index) => (
          <li key={`${beat.key}-${index}`} className="sim-story__beat">
            {t(beat.key, beat.params)}
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface SimResultPanelProps {
  sides: SimPanelSide[];
  category: SimCategory;
  winnerSideId?: string;
  specialtyHits: string[];
  /** INJ-09: stamina and injury per player (staff only). */
  conditions?: SimCondition[];
  playByPlay: SimBeat[];
  /** Restarts the story when it changes (a new preview). */
  seed: number;
  className?: string;
}

/**
 * A sim result: category, sides (odds bars for staff), specialty markers and
 * the play-by-play. Shared by GM previews, the official sim and the public
 * story on simulated matches. Odds only render when the sides carry them.
 */
export default function SimResultPanel({
  sides,
  category,
  winnerSideId,
  specialtyHits,
  conditions,
  playByPlay,
  seed,
  className = '',
}: SimResultPanelProps) {
  const { t } = useTranslation();
  return (
    <section className={`sim-result ${className}`.trim()} data-testid="sim-result-panel">
      <div className="sim-result__meta">
        <Badge tone="primary">{t('sim.panel.category', { category: t(`simCategories.${category}`) })}</Badge>
      </div>
      <SimOddsList sides={sides} specialtyHits={specialtyHits} winnerSideId={winnerSideId} conditions={conditions} />
      <SimPlayByPlay key={seed} beats={playByPlay} />
    </section>
  );
}
