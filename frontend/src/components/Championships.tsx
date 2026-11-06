import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { championshipsApi, divisionsApi, playersApi } from '../services/api';
import type { PlayerDirectoryEntry } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import { logger } from '../utils/logger';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { type Division, type Championship, type ChampionshipReign, type Player } from '../types';
import DivisionFilter from './DivisionFilter';
import Avatar from './ui/Avatar';
import Badge from './ui/Badge';
import Button from './ui/Button';
import DataTable from './ui/DataTable';
import type { DataTableColumn } from './ui/DataTable';
import EmptyState from './ui/EmptyState';
import Modal from './ui/Modal';
import PageHeader from './ui/PageHeader';
import PhotoTile from './ui/PhotoTile';
import type { TileAccent } from './ui/PhotoTile';
import Skeleton from './ui/Skeleton';
import './Championships.css';

function toIds(holder: string | string[]): string[] {
  return Array.isArray(holder) ? holder : [holder];
}

/** Rim light for a title. Titles carry no tier field, so this reads the name. */
function getTitleAccent(championship: Championship): TileAccent {
  if (championship.type === 'tag') return 'tag';
  const name = championship.name.toLowerCase();
  if (/world|universal|heavyweight/.test(name)) return 'world';
  if (/united states|\bus\b/.test(name)) return 'us';
  if (/intercontinental|\bic\b/.test(name)) return 'ic';
  return 'none';
}

export default function Championships() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.championships'));
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [directory, setDirectory] = useState<PlayerDirectoryEntry[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [selectedChampionship, setSelectedChampionship] = useState<Championship | null>(null);
  const [history, setHistory] = useState<ChampionshipReign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const historyAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        // Inactive titles stay listed so their history remains public. The
        // directory covers former champions who no longer have a wrestler.
        const [champData, playerData, directoryData, divisionsData] = await Promise.all([
          championshipsApi.getAll(abortController.signal, { includeInactive: true }),
          playersApi.getAll(abortController.signal),
          playersApi.getDirectory(abortController.signal),
          divisionsApi.getAll(abortController.signal),
        ]);
        if (abortController.signal.aborted) return;
        setChampionships(champData);
        setPlayers(playerData);
        setDirectory(directoryData);
        setDivisions(divisionsData);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };

    fetchData();
    return () => abortController.abort();
  }, [reloadCount]);

  useEffect(() => () => historyAbortRef.current?.abort(), []);

  const openHistory = async (championship: Championship) => {
    historyAbortRef.current?.abort();
    const abortController = new AbortController();
    historyAbortRef.current = abortController;

    setSelectedChampionship(championship);
    setHistory([]);
    setHistoryFailed(false);
    setLoadingHistory(true);

    try {
      const historyData = await championshipsApi.getHistory(championship.championshipId, abortController.signal);
      if (!abortController.signal.aborted) setHistory(historyData);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        logger.error('Failed to load championship history');
        setHistoryFailed(true);
      }
    } finally {
      if (!abortController.signal.aborted) setLoadingHistory(false);
    }
  };

  const closeHistory = () => {
    historyAbortRef.current?.abort();
    setSelectedChampionship(null);
  };

  const filteredChampionships = useMemo((): Championship[] => {
    let result = championships;
    if (selectedDivision === 'none') {
      result = championships.filter((championship) => !championship.divisionId);
    } else if (selectedDivision !== 'all') {
      result = championships.filter((championship) => championship.divisionId === selectedDivision);
    }
    // Active titles first.
    return [...result].sort((first, second) => Number(second.isActive !== false) - Number(first.isActive !== false));
  }, [championships, selectedDivision]);

  const playerNames = useMemo(() => new Map(directory.map((entry) => [entry.playerId, entry.name])), [directory]);
  const playerImages = useMemo(() => new Map(players.map((player) => [player.playerId, player.imageUrl])), [players]);

  const getHolderName = (holder: string | string[]) =>
    toIds(holder).map((playerId) => playerNames.get(playerId) ?? t('common.unknown')).join(' & ');

  const historyColumns: DataTableColumn<ChampionshipReign>[] = [
    {
      key: 'champion',
      header: t('championships.table.champion'),
      render: (reign) => <span className="title-history__champion">{getHolderName(reign.champion)}</span>,
    },
    { key: 'won', header: t('championships.table.wonDate'), render: (reign) => formatDate(reign.wonDate) },
    {
      key: 'lost',
      header: t('championships.table.lostDate'),
      render: (reign) => (reign.lostDate ? formatDate(reign.lostDate) : t('common.current')),
    },
    {
      key: 'days',
      header: t('championships.table.daysHeld'),
      render: (reign) => (reign.daysHeld !== undefined ? `${reign.daysHeld} ${t('common.days')}` : '-'),
      align: 'end',
    },
    {
      key: 'defenses',
      header: t('championships.table.defenses'),
      render: (reign) => reign.defenses ?? 0,
      align: 'end',
    },
  ];

  const renderTitles = () => {
    if (loading) return <Skeleton variant="cards" />;

    if (error !== null) {
      return (
        <EmptyState
          title={t('common.error')}
          description={error || t('championships.loadFailed')}
          actionLabel={t('common.retry')}
          onAction={() => setReloadCount((count) => count + 1)}
        />
      );
    }

    if (championships.length === 0) {
      return <EmptyState title={t('championships.emptyTitle')} description={t('championships.noChampionships')} />;
    }

    if (filteredChampionships.length === 0) {
      return <EmptyState title={t('championships.noneInDivisionTitle')} description={t('championships.noneInDivision')} />;
    }

    return (
      <ul className="title-grid">
        {filteredChampionships.map((championship) => {
          const inactive = championship.isActive === false;
          const holder = championship.currentChampion;
          const holderIds = holder ? toIds(holder) : [];
          // The belt photo leads; a title without one shows its champion instead.
          const imageUrl = championship.imageUrl || playerImages.get(holderIds[0] ?? '');
          return (
            <li key={championship.championshipId} className={inactive ? 'title-item title-item--inactive' : 'title-item'}>
              <PhotoTile
                className="title-item__tile"
                imageUrl={imageUrl}
                imageAlt={championship.name}
                eyebrow={championship.name}
                title={holder ? getHolderName(holder) : t('common.vacant')}
                accent={inactive ? 'none' : getTitleAccent(championship)}
                badge={inactive ? <Badge>{t('championships.inactive')}</Badge> : undefined}
                meta={(
                  <span className="title-item__meta">
                    {holderIds.map((playerId) => (
                      <Avatar key={playerId} size="sm" src={playerImages.get(playerId)} name={playerNames.get(playerId) ?? t('common.unknown')} />
                    ))}
                    {championship.type === 'singles' ? t('championships.singles') : t('championships.tagTeam')}
                  </span>
                )}
              />
              <Button
                variant="secondary"
                fullWidth
                aria-label={`${t('championships.viewHistory')}: ${championship.name}`}
                onClick={() => openHistory(championship)}
              >
                {t('championships.history')}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderHistory = () => {
    if (loadingHistory) return <Skeleton variant="table" count={4} />;
    if (historyFailed) return <EmptyState title={t('common.error')} description={t('championships.historyLoadFailed')} />;
    return (
      <DataTable
        className="title-history"
        caption={t('championships.history')}
        columns={historyColumns}
        rows={history}
        rowKey={(reign) => reign.wonDate}
        empty={<EmptyState title={t('championships.history')} description={t('championships.noHistory')} />}
      />
    );
  };

  return (
    <div className="championships-page">
      <PageHeader title={t('championships.title')} />

      {divisions.length > 0 && (
        <div className="championships-page__filter">
          <DivisionFilter
            divisions={divisions}
            selectedDivision={selectedDivision}
            onSelect={setSelectedDivision}
            labelKey="championships.filterByDivision"
            showNoDivision
          />
        </div>
      )}

      {renderTitles()}

      <Modal
        open={selectedChampionship !== null}
        onClose={closeHistory}
        title={`${selectedChampionship?.name ?? ''} ${t('championships.history')}`}
        size="lg"
      >
        {renderHistory()}
      </Modal>
    </div>
  );
}
