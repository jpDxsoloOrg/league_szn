import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { championshipsApi, contendersApi, divisionsApi, playersApi } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { Championship, Division, Player } from '../../types';
import type { ChampionshipContenders, ContenderChampion } from '../../types/contender';
import Avatar from '../ui/Avatar';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import ContenderCard from './ContenderCard';
import { MemberAvatars, MemberNames } from './ContenderMembers';
import type { MemberLookup } from './ContenderMembers';
import './ContenderRankings.css';

const MIN_MATCHES_HINT = 3;

export default function ContenderRankings() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('contenders.title'));
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedChampionshipId, setSelectedChampionshipId] = useState('');
  const [contenderData, setContenderData] = useState<ChampionshipContenders | null>(null);
  const [loading, setLoading] = useState(true);
  const [contendersLoading, setContendersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contendersFailed, setContendersFailed] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  // Only loaded once a tag title is shown, for the members' hover cards.
  const [players, setPlayers] = useState<Player[] | null>(null);

  const selectedChampionship = championships.find(
    (championship) => championship.championshipId === selectedChampionshipId,
  );
  const isTagTitle = selectedChampionship?.type === 'tag';
  const hasTagEntries = Boolean(
    contenderData
      && (contenderData.currentChampion?.type === 'tagTeam'
        || contenderData.contenders.some((contender) => contender.entityType === 'tagTeam')),
  );

  const memberLookup = useMemo<MemberLookup | undefined>(() => {
    if (!players) return undefined;
    return {
      playersById: new Map(players.map((player) => [player.playerId, player])),
      divisions,
    };
  }, [players, divisions]);

  // Division titles first, sorted by division name, then open titles. The
  // division prefix only matters when there is more than one group.
  const championshipOptions = useMemo(() => {
    const divisionNames = new Map(divisions.map((division) => [division.divisionId, division.name]));
    const getGroupName = (championship: Championship) => {
      if (!championship.divisionId) return t('contenders.openDivision');
      return divisionNames.get(championship.divisionId) ?? t('contenders.unknownDivision');
    };

    const sorted = [...championships].sort((first, second) => {
      if (!first.divisionId !== !second.divisionId) return first.divisionId ? -1 : 1;
      return getGroupName(first).localeCompare(getGroupName(second));
    });
    const hasGroups = new Set(sorted.map(getGroupName)).size > 1;

    return sorted.map((championship) => ({
      value: championship.championshipId,
      label: hasGroups ? `${getGroupName(championship)}: ${championship.name}` : championship.name,
    }));
  }, [championships, divisions, t]);

  useEffect(() => {
    const controller = new AbortController();

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [champsData, divisionsData] = await Promise.all([
          championshipsApi.getAll(controller.signal),
          divisionsApi.getAll(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const activeChamps = champsData.filter((championship) => championship.isActive);
        setChampionships(activeChamps);
        setDivisions(divisionsData);
        setSelectedChampionshipId(activeChamps[0]?.championshipId ?? '');
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadData();
    return () => controller.abort();
  }, [reloadCount]);

  useEffect(() => {
    if (!selectedChampionshipId) return;
    const controller = new AbortController();

    const loadContenders = async () => {
      try {
        setContendersLoading(true);
        setContendersFailed(false);
        const data = await contendersApi.getForChampionship(selectedChampionshipId, controller.signal);
        if (!controller.signal.aborted) setContenderData(data);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setContenderData(null);
          setContendersFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setContendersLoading(false);
      }
    };

    loadContenders();
    return () => controller.abort();
  }, [selectedChampionshipId, reloadCount]);

  useEffect(() => {
    if (!hasTagEntries || players) return;
    const controller = new AbortController();

    const loadPlayers = async () => {
      try {
        const data = await playersApi.getAll(controller.signal);
        if (!controller.signal.aborted) setPlayers(data);
      } catch {
        // Hover cards are extra detail: member names still render without them.
      }
    };

    loadPlayers();
    return () => controller.abort();
  }, [hasTagEntries, players]);

  const formatCalculatedAt = (dateString: string) =>
    new Date(dateString).toLocaleDateString(i18n.language, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });

  const noContenders = isTagTitle ? (
    <EmptyState
      title={t('contenders.tagTeam.noContenders')}
      description={t('contenders.tagTeam.noContendersHint', { minMatches: MIN_MATCHES_HINT })}
    />
  ) : (
    <EmptyState
      title={t('contenders.noContenders')}
      description={t('contenders.noContendersHint', { minMatches: MIN_MATCHES_HINT })}
    />
  );

  const renderChampion = (champion: ContenderChampion) => {
    if (champion.type === 'tagTeam') {
      // The team fields are null when the holders are not a known tag team.
      const title = champion.tagTeamName ?? champion.members.map((member) => member.wrestlerName).join(' & ');
      return (
        <section className="contender-champion contender-champion--tag" aria-labelledby="contender-champion-title">
          <MemberAvatars members={champion.members} size="lg" ring="gold" />
          <div className="contender-champion__text">
            <h2 id="contender-champion-title" className="contender-champion__label">
              <Crown aria-hidden="true" size={16} />
              {t('contenders.tagTeam.currentChampions')}
            </h2>
            <p className="contender-champion__wrestler">
              {champion.tagTeamId ? (
                <Link to={`/tag-teams/${champion.tagTeamId}`} className="contender-champion__team-link">{title}</Link>
              ) : title}
            </p>
            <p className="contender-champion__player">
              <MemberNames members={champion.members} lookup={memberLookup} />
            </p>
          </div>
        </section>
      );
    }

    return (
      <section className="contender-champion" aria-labelledby="contender-champion-title">
        <Avatar src={champion.imageUrl} name={champion.wrestlerName} size="lg" ring="gold" />
        <div className="contender-champion__text">
          <h2 id="contender-champion-title" className="contender-champion__label">
            <Crown aria-hidden="true" size={16} />
            {t('contenders.currentChampion')}
          </h2>
          <p className="contender-champion__wrestler">{champion.wrestlerName}</p>
          <p className="contender-champion__player">{champion.playerName}</p>
        </div>
      </section>
    );
  };

  const renderRankings = () => {
    if (contendersLoading) return <Skeleton variant="block" count={3} />;

    if (contendersFailed) {
      return (
        <EmptyState
          title={t('common.error')}
          description={t('contenders.rankingsLoadFailed')}
          actionLabel={t('common.retry')}
          onAction={() => setReloadCount((count) => count + 1)}
        />
      );
    }

    if (!contenderData) return noContenders;

    const champion = contenderData.currentChampion;

    return (
      <>
        {champion && renderChampion(champion)}

        <section>
          <h2 className="contender-rankings__heading">{t('contenders.rankings')}</h2>
          {contenderData.contenders.length === 0 ? noContenders : (
            <ol className="contender-rankings__list">
              {contenderData.contenders.map((contender) => (
                <ContenderCard key={contender.playerId} contender={contender} memberLookup={memberLookup} />
              ))}
            </ol>
          )}
        </section>

        {contenderData.calculatedAt && (
          <p className="contender-rankings__footer">
            {t('contenders.lastCalculated')}: {formatCalculatedAt(contenderData.calculatedAt)}
          </p>
        )}
      </>
    );
  };

  const renderContent = () => {
    if (loading) return <Skeleton variant="cards" count={4} />;

    if (error !== null) {
      return (
        <EmptyState
          title={t('common.error')}
          description={error || t('contenders.loadFailed')}
          actionLabel={t('common.retry')}
          onAction={() => setReloadCount((count) => count + 1)}
        />
      );
    }

    if (championships.length === 0) {
      return <EmptyState title={t('contenders.emptyTitle')} description={t('contenders.noData')} />;
    }

    return renderRankings();
  };

  return (
    <div className="contender-rankings">
      <PageHeader
        title={t('contenders.title')}
        subtitle={t('contenders.subtitle')}
        actions={championshipOptions.length > 0 ? (
          <Select
            className="contender-rankings__select"
            label={t('contenders.selectChampionship')}
            value={selectedChampionshipId}
            onValueChange={setSelectedChampionshipId}
            options={championshipOptions}
          />
        ) : undefined}
      />
      {renderContent()}
    </div>
  );
}
