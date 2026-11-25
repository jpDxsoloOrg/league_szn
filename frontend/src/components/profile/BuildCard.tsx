import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { buildsApi, type LeveledBuildMove, type PlayerBuildView } from '../../services/api/builds.api';
import { SpecialtyChip, StatBars, StyleBadge, styleBonuses } from '../builds';
import Card from '../ui/Card';
import MoveList from './MoveList';
import './BuildCard.css';

export interface BuildCardProps {
  playerId: string;
  /** The viewer is this player. A default build then shows a setup prompt instead of nothing. */
  isOwnProfile?: boolean;
  /** Optional button for the setup prompt, e.g. one that opens the build editor. */
  setupAction?: ReactNode;
}

/** Moves with the levels the sim uses (scaled down when over budget). */
function withEffectiveLevels(moves: LeveledBuildMove[], levels: number[]): LeveledBuildMove[] {
  return moves.map((move, index) => ({ ...move, level: levels[index] ?? move.level }));
}

/**
 * Public build card on a profile (BLD-13): style, specialty, the four stats
 * (with the style bonus marked) and move levels. Shows no odds or sim results.
 * Players still on the default build have no card, except on their own
 * profile, where it asks them to set one up. Renders nothing while loading or
 * if the build can't be read.
 */
export default function BuildCard({ playerId, isOwnProfile = false, setupAction }: BuildCardProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<PlayerBuildView | null>(null);

  useEffect(() => {
    setView(null);
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await buildsApi.getPlayerBuild(playerId, controller.signal);
        if (!controller.signal.aborted) setView(response);
      } catch {
        // The card is extra information; the profile stays usable without it.
      }
    };
    void load();
    return () => controller.abort();
  }, [playerId]);

  if (!view) return null;
  if (view.isDefault && !isOwnProfile) return null;

  const headingId = `build-card-title-${playerId}`;

  if (view.isDefault) {
    return (
      <section className="profile-section build-card" aria-labelledby={headingId} data-testid="build-card-setup">
        <h2 className="profile-section__title" id={headingId}>{t('builds.card.title')}</h2>
        <Card>
          <div className="build-card__setup">
            <div>
              <strong>{t('builds.card.setupTitle')}</strong>
              <p className="build-card__setup-body">{t('builds.card.setupBody')}</p>
            </div>
            {setupAction}
          </div>
        </Card>
      </section>
    );
  }

  const { effective, moves } = view;
  const signatures = withEffectiveLevels(moves.signatures, effective.signatureLevels);
  const finishers = withEffectiveLevels(moves.finishers, effective.finisherLevels);

  return (
    <section className="profile-section build-card" aria-labelledby={headingId} data-testid="build-card">
      <h2 className="profile-section__title" id={headingId}>{t('builds.card.title')}</h2>
      <Card>
        <div className="build-card__badges">
          <StyleBadge style={view.build.style} />
          {view.build.specialty && <SpecialtyChip category={view.build.specialty} />}
        </div>
        <div className="build-card__body">
          <div className="build-card__stats">
            <h3 className="build-card__subtitle">{t('builds.card.stats')}</h3>
            <StatBars stats={effective.stats} bonuses={styleBonuses(effective)} />
          </div>
          {(signatures.length > 0 || finishers.length > 0) && (
            <div className="build-card__moves">
              <MoveList title={t('builds.card.signatureLevels')} moves={signatures} showLevels />
              <MoveList title={t('builds.card.finisherLevels')} moves={finishers} showLevels />
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
