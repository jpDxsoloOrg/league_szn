import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { buildsApi, type PlayerBuildView } from '../../services/api/builds.api';
import HomeSection from '../home/HomeSection';
import Button from '../ui/Button';
import Card from '../ui/Card';
import './DashboardBuildNudge.css';

interface BuildNudge {
  key: 'over' | 'unspent' | 'specialty';
  text: string;
  options?: Record<string, number>;
}

/** What the wrestler should still do with their build, most urgent first. */
function buildNudges(view: PlayerBuildView): BuildNudge[] {
  const nudges: BuildNudge[] = [];
  if (view.budget.overBudget) {
    nudges.push({ key: 'over', text: 'builds.nudge.overBudget', options: { count: -view.budget.remaining } });
  } else if (view.budget.remaining > 0) {
    nudges.push({ key: 'unspent', text: 'builds.nudge.unspent', options: { count: view.budget.remaining } });
  }
  if (!view.build.specialty) nudges.push({ key: 'specialty', text: 'builds.nudge.pickSpecialty' });
  return nudges;
}

/**
 * Dashboard reminder (BLD-12): "N unspent points", "Build over budget" or
 * "Pick a specialty", with a button that opens the build editor. Self-gates:
 * renders nothing unless the viewer is a wrestler with a player and there is
 * something to do.
 */
export default function DashboardBuildNudge() {
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler, playerId } = useAuth();
  const eligible = isAuthenticated && isWrestler && Boolean(playerId);
  const [view, setView] = useState<PlayerBuildView | null>(null);

  useEffect(() => {
    setView(null);
    if (!eligible || !playerId) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await buildsApi.getPlayerBuild(playerId, controller.signal);
        if (!controller.signal.aborted) setView(response);
      } catch {
        // The nudge is optional; the dashboard works without it.
      }
    };
    void load();
    return () => controller.abort();
  }, [eligible, playerId]);

  if (!eligible || !view) return null;
  const nudges = buildNudges(view);
  if (nudges.length === 0) return null;

  return (
    <HomeSection title={t('builds.nudge.title')} accent="cyan">
      <Card className="build-nudge" data-testid="build-nudge">
        <ul className="build-nudge__list">
          {nudges.map((nudge) => (
            <li key={nudge.key} className={`build-nudge__item build-nudge__item--${nudge.key}`}>
              {t(nudge.text, nudge.options)}
            </li>
          ))}
        </ul>
        <Button
          to="/profile"
          linkState={{ editBuild: true }}
          variant="secondary"
          icon={<SlidersHorizontal aria-hidden="true" size={16} />}
        >
          {t('builds.nudge.open')}
        </Button>
      </Card>
    </HomeSection>
  );
}
