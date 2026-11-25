import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Dices } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { SideTagTeam, StoredMatchSimulation } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import SimResultPanel from './SimResultPanel';
import { buildSimSides, matchSimSides } from './simSides';

/** "Simulated" pill for a match the sim settled. Shown to everyone. */
export function SimulatedBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone="primary" icon={<Dices size={14} aria-hidden="true" />} title={t('sim.badgeHint')} data-testid="simulated-badge">
      {t('sim.badge')}
    </Badge>
  );
}

export interface SimulatedMatchStoryProps {
  match: { participants: string[]; teams?: string[][]; sideTagTeams?: (SideTagTeam | null)[] };
  simulation: StoredMatchSimulation;
  nameOf: (playerId: string) => string;
}

/**
 * The stored sim as a panel. Odds only render for staff, and only when the
 * API sent them (it strips them for everyone else).
 */
export function SimulatedMatchStory({ match, simulation, nameOf }: SimulatedMatchStoryProps) {
  const { isAdminOrModerator } = useAuth();
  const odds = isAdminOrModerator ? simulation.probabilities : undefined;
  const sides = buildSimSides({
    sides: odds && odds.length > 0 ? odds.map((entry) => entry.playerIds) : matchSimSides(match),
    nameOf,
    sideTagTeams: match.teams && match.teams.length >= 2 ? match.sideTagTeams : undefined,
    odds,
  });
  return (
    <SimResultPanel
      sides={sides}
      category={simulation.category}
      winnerSideId={simulation.winnerSideId}
      specialtyHits={simulation.specialtyHits}
      playByPlay={simulation.playByPlay}
      seed={simulation.seed}
    />
  );
}

/** A "Play-by-play" button that opens the stored sim in a dialog. */
export function SimulatedMatchStoryButton(props: SimulatedMatchStoryProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" icon={<BookOpen size={16} aria-hidden="true" />} onClick={() => setOpen(true)}>
        {t('sim.panel.playByPlay')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('sim.storyTitle')}>
        {open && <SimulatedMatchStory {...props} />}
      </Modal>
    </>
  );
}
