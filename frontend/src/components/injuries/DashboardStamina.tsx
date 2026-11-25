import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import HomeSection from '../home/HomeSection';
import Card from '../ui/Card';
import StaminaMeter from './StaminaMeter';
import { usePlayerCondition } from './usePlayerCondition';

/**
 * Dashboard stamina card (INJ-12). Self-gates: renders nothing unless the
 * injuries feature is on and the viewer is a wrestler with a player.
 */
export default function DashboardStamina() {
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler, playerId } = useAuth();
  const condition = usePlayerCondition(playerId, isAuthenticated && isWrestler);
  if (!condition) return null;

  return (
    <HomeSection
      title={t('injuries.stamina.cardTitle')}
      accent="cyan"
      linkTo="/profile"
      linkLabel={t('injuries.stamina.cardLink')}
    >
      <Card>
        <StaminaMeter condition={condition} />
      </Card>
    </HomeSection>
  );
}
