import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { contractsApi, type Contract, type RosterPlayer } from '../../services/api/contracts.api';
import { divisionsApi } from '../../services/api/divisions.api';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import { useToast } from '../ui/toastContext';
import OfferContractModal, { type OfferCandidate } from './OfferContractModal';
import './FreeAgents.css';

function displayName(player: RosterPlayer): string {
  return player.currentWrestler?.trim() || player.name;
}

/**
 * Public free agent pool (ECO-12): visible players without an active
 * contract. GMs get an "Offer contract" button on each row.
 */
export default function FreeAgents() {
  const { t } = useTranslation();
  useDocumentTitle(t('contracts.freeAgents.title', 'Free Agents'));
  const { isAdminOrModerator } = useAuth();
  const { showToast } = useToast();
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [divisionNames, setDivisionNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offerTarget, setOfferTarget] = useState<OfferCandidate | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [freeAgents, divisions] = await Promise.all([
          contractsApi.getFreeAgents(controller.signal),
          divisionsApi.getAll(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setPlayers(freeAgents);
        setDivisionNames(new Map(divisions.map((division) => [division.divisionId, division.name])));
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : t('contracts.freeAgents.loadFailed', 'Could not load the free agents.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [t]);

  const columns = useMemo<DataTableColumn<RosterPlayer>[]>(() => {
    const base: DataTableColumn<RosterPlayer>[] = [
      {
        key: 'player',
        header: t('contracts.freeAgents.columns.player', 'Wrestler'),
        render: (player) => (
          <Link to={`/player/${player.playerId}`} className="free-agents__player">
            <Avatar src={player.imageUrl} name={displayName(player)} size="sm" />
            <span className="free-agents__names">
              <span className="free-agents__name">{displayName(player)}</span>
              {player.currentWrestler?.trim() && <span className="free-agents__sub">{player.name}</span>}
            </span>
          </Link>
        ),
        sortValue: displayName,
      },
      {
        key: 'record',
        header: t('contracts.freeAgents.columns.record', 'Record'),
        render: (player) => <span className="free-agents__record">{player.wins}-{player.losses}-{player.draws}</span>,
        sortValue: (player) => player.wins - player.losses,
      },
      {
        key: 'division',
        header: t('contracts.freeAgents.columns.division', 'Division'),
        render: (player) => (player.divisionId && divisionNames.get(player.divisionId))
          || t('contracts.freeAgents.noDivision', 'No division'),
        sortValue: (player) => (player.divisionId && divisionNames.get(player.divisionId)) || '',
      },
    ];
    if (!isAdminOrModerator) return base;
    return [
      ...base,
      {
        key: 'offer',
        header: t('contracts.freeAgents.columns.offer', 'Contract'),
        render: (player) => (
          <Button
            size="sm"
            variant="secondary"
            disabled={player.hasLinkedAccount === false}
            title={player.hasLinkedAccount === false ? t('contracts.offer.noAccount', 'No linked account') : undefined}
            onClick={() => setOfferTarget({
              playerId: player.playerId,
              label: displayName(player),
              hasLinkedAccount: player.hasLinkedAccount,
            })}
          >
            {t('contracts.freeAgents.offer', 'Offer contract')}
          </Button>
        ),
      },
    ];
  }, [t, divisionNames, isAdminOrModerator]);

  const handleOffered = (_contract: Contract, player: OfferCandidate) => {
    setOfferTarget(undefined);
    showToast(t('contracts.offer.sent', { defaultValue: 'Offer sent to {{name}}.', name: player.label }), 'success');
  };

  return (
    <div className="free-agents">
      <PageHeader
        title={t('contracts.freeAgents.title', 'Free Agents')}
        subtitle={t('contracts.freeAgents.subtitle', 'Wrestlers without a contract, ready to sign.')}
      />
      {error ? (
        <EmptyState title={error} />
      ) : (
        <DataTable
          caption={t('contracts.freeAgents.title', 'Free Agents')}
          columns={columns}
          rows={players}
          rowKey={(player) => player.playerId}
          loading={loading}
          empty={<EmptyState title={t('contracts.freeAgents.empty', 'Every wrestler is under contract right now.')} />}
        />
      )}
      {isAdminOrModerator && (
        <OfferContractModal
          open={offerTarget !== undefined}
          onClose={() => setOfferTarget(undefined)}
          player={offerTarget}
          onOffered={handleOffered}
        />
      )}
    </div>
  );
}
