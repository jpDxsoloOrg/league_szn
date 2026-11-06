import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { factionsApi } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../utils/logger';
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Select from '../../ui/Select';
import Tabs from '../../ui/Tabs';
import { useToast } from '../../ui/toastContext';
import GroupFormCell from '../GroupFormCell';
import InviteToFactionModal from '../InviteToFactionModal';
import RemoveMemberModal from '../RemoveMemberModal';
import { formatRecord } from '../factionFormat';
import type { FactionStatsResponse } from '../../../types/faction';
import type { FactionDetailContext } from '../FactionDetail';
import '../groupUi.css';
import './FactionMembers.css';

type SortKey = 'wins' | 'winPct' | 'activity' | 'name';
type FilterKey = 'all' | 'active' | 'inactive';

type FormResult = 'W' | 'L' | 'D';

interface MemberRow {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
  psnId?: string;
  isLeader: boolean;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  recentForm: FormResult[];
  currentStreak?: { type: FormResult; count: number };
}

function sortRows(rows: MemberRow[], by: SortKey): MemberRow[] {
  const copy = [...rows];
  switch (by) {
    case 'winPct':
      return copy.sort((a, b) => b.winPercentage - a.winPercentage || b.wins - a.wins);
    case 'activity':
      return copy.sort(
        (a, b) =>
          b.recentForm.length - a.recentForm.length || b.wins + b.losses - (a.wins + a.losses),
      );
    case 'name':
      return copy.sort((a, b) => a.wrestlerName.localeCompare(b.wrestlerName));
    case 'wins':
    default:
      return copy.sort((a, b) => b.wins - a.wins || b.winPercentage - a.winPercentage);
  }
}

function filterRows(rows: MemberRow[], filter: FilterKey): MemberRow[] {
  if (filter === 'all') return rows;
  // An "inactive" member has no recent-form entries yet; "active" is the
  // complement. Until per-member activity timestamps land this is the
  // closest approximation we have without an extra API call.
  if (filter === 'active') return rows.filter((r) => r.recentForm.length > 0);
  return rows.filter((r) => r.recentForm.length === 0);
}

function matchesQuery(row: MemberRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    row.playerName.toLowerCase().includes(needle) ||
    row.wrestlerName.toLowerCase().includes(needle)
  );
}

// ─── Main component ─────────────────────────────────────────────────

export default function FactionMembers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { faction } = useOutletContext<FactionDetailContext>();
  const auth = useAuth();
  const { showToast } = useToast();
  const isLeader = auth.playerId !== null && auth.playerId === faction.leaderId;

  const [stats, setStats] = useState<FactionStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useState<SortKey>('wins');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{
    playerId: string;
    playerName: string;
    mode: 'remove' | 'leave';
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch per-member stats on mount (and on reload).
  useEffect(() => {
    const controller = new AbortController();

    const loadStats = async () => {
      try {
        const response = await factionsApi.getStats(faction.stableId, undefined, controller.signal);
        if (!controller.signal.aborted) {
          setStats(response);
          setStatsError(null);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.error('Members tab: getStats failed');
          setStatsError(err.message);
        }
      }
    };

    loadStats();
    return () => controller.abort();
  }, [faction.stableId, reloadKey]);

  // Click-outside to close the 3-dot menu.
  useEffect(() => {
    if (!openMenuFor) return;
    const onDown = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setOpenMenuFor(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuFor(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenuFor]);

  const rows: MemberRow[] = useMemo(() => {
    const statsByPlayer = new Map(
      (stats?.members ?? []).map((m) => [m.playerId, m]),
    );

    return faction.members.map((member) => {
      const s = statsByPlayer.get(member.playerId);
      return {
        playerId: member.playerId,
        playerName: member.playerName,
        wrestlerName: member.wrestlerName,
        imageUrl: member.imageUrl,
        psnId: member.psnId,
        isLeader: member.playerId === faction.leaderId,
        wins: s?.wins ?? member.wins ?? 0,
        losses: s?.losses ?? member.losses ?? 0,
        draws: s?.draws ?? member.draws ?? 0,
        winPercentage: s?.winPercentage ?? 0,
        recentForm: (s?.recentForm ?? []) as FormResult[],
        currentStreak: s?.currentStreak,
      };
    });
  }, [faction.members, faction.leaderId, stats]);

  const visibleRows = useMemo(() => {
    const filtered = filterRows(rows, filter).filter((r) => matchesQuery(r, query));
    return sortRows(filtered, sort);
  }, [rows, filter, sort, query]);

  const totals = useMemo(() => {
    const wins = rows.reduce((acc, r) => acc + r.wins, 0);
    const losses = rows.reduce((acc, r) => acc + r.losses, 0);
    const draws = rows.reduce((acc, r) => acc + r.draws, 0);
    const totalMatches = wins + losses + draws;
    const winPct = totalMatches > 0 ? Math.round((wins / totalMatches) * 1000) / 10 : 0;
    return { wins, losses, draws, winPct };
  }, [rows]);

  const bestPerformer = useMemo(
    () => [...rows].sort((a, b) => b.winPercentage - a.winPercentage)[0] ?? null,
    [rows],
  );

  const needsSupport = useMemo(() => {
    const scoreLosses = (r: MemberRow) => r.recentForm.filter((x) => x === 'L').length;
    return [...rows].sort((a, b) => scoreLosses(b) - scoreLosses(a))[0] ?? null;
  }, [rows]);

  const handleRemove = async () => {
    if (!memberToRemove) return;
    const { mode } = memberToRemove;
    setRemoving(true);
    setRemoveError(null);
    try {
      const result = (await factionsApi.removeMember(
        faction.stableId,
        memberToRemove.playerId,
      )) as unknown as { status?: string };

      const wasDisbanded = result?.status === 'disbanded';
      const removedName = memberToRemove.playerName;
      setMemberToRemove(null);

      // FAC-23: when the caller is leaving, they lose access to this Detail
      // page entirely — always navigate them back to /factions whether or
      // not the faction also disbanded as a side effect.
      if (mode === 'leave') {
        navigate('/factions', {
          state: {
            toast: wasDisbanded
              ? t(
                  'factions.my.removeMemberDisbanded',
                  'Faction disbanded — only the leader remained.',
                )
              : t('factions.members.leaveSuccess', 'You left {{factionName}}.', {
                  factionName: faction.name,
                }),
          },
        });
        return;
      }

      if (wasDisbanded) {
        navigate('/factions', {
          state: {
            toast: t(
              'factions.my.removeMemberDisbanded',
              'Faction disbanded — only the leader remained.',
            ),
          },
        });
        return;
      }

      showToast(
        t('factions.my.removeMemberSuccess', '{{playerName}} removed from the faction.', {
          playerName: removedName,
        }),
        'success',
      );
      // Refresh the per-member stats so the row disappears and the totals
      // recalculate. The shell's getById data is stale here but the tab
      // already reflects the new shape on the next mount.
      setReloadKey((k) => k + 1);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : t('common.error', 'Failed'));
    } finally {
      setRemoving(false);
    }
  };

  const willDisband =
    memberToRemove !== null && (faction.memberIds?.length ?? faction.members.length) <= 2;

  const sortOptions: ReadonlyArray<{ value: SortKey; i18nKey: string; fallback: string }> = [
    { value: 'wins', i18nKey: 'factions.members.sortByWins', fallback: 'By Wins' },
    { value: 'winPct', i18nKey: 'factions.members.sortByWinPct', fallback: 'By Win%' },
    { value: 'activity', i18nKey: 'factions.members.sortByActivity', fallback: 'By Activity' },
    { value: 'name', i18nKey: 'factions.redesign.sortByName', fallback: 'By Name' },
  ];

  const filterOptions: ReadonlyArray<{ value: FilterKey; i18nKey: string; fallback: string }> = [
    { value: 'all', i18nKey: 'factions.members.filterAll', fallback: 'All' },
    { value: 'active', i18nKey: 'factions.members.filterActive', fallback: 'Active' },
    { value: 'inactive', i18nKey: 'factions.members.filterInactive', fallback: 'Inactive' },
  ];

  return (
    <div className="group-page">
      {statsError && (
        <p className="group-error" role="alert">
          {t('factions.members.statsError', 'Could not load member stats.')}: {statsError}
        </p>
      )}

      <div className="group-toolbar">
        <Tabs
          label={t('factions.members.filterLabel', 'Filter by activity')}
          value={filter}
          onValueChange={(value) => setFilter(value as FilterKey)}
          items={filterOptions.map((option) => ({ value: option.value, label: t(option.i18nKey, option.fallback) }))}
        />
        <Select
          label={t('factions.members.sortLabel', 'Sort members')}
          value={sort}
          onValueChange={(value) => setSort(value as SortKey)}
          options={sortOptions.map((option) => ({ value: option.value, label: t(option.i18nKey, option.fallback) }))}
        />
        <label className="group-search">
          <span className="sr-only">{t('factions.members.searchLabel', 'Search members')}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('factions.members.searchPlaceholder', 'Search…')}
          />
        </label>
        {isLeader && (
          <Button className="group-toolbar__push" onClick={() => setInviteOpen(true)}>
            {t('factions.members.inviteCta', 'Invite member')}
          </Button>
        )}
      </div>

      {visibleRows.length === 0 ? (
        <p className="group-empty">
          {rows.length === 0 && faction.memberIds.length > 0
            ? t('factions.overview.rosterMissing', '{{count}} members are no longer listed on the roster.', {
                count: faction.memberIds.length,
              })
            : t('factions.members.empty', 'No members match the current filter.')}
        </p>
      ) : (
        <div className="faction-members__list">
          {visibleRows.map((row) => {
            const isMenuOpen = openMenuFor === row.playerId;
            return (
              <article key={row.playerId} className="faction-members__row">
                <Avatar src={row.imageUrl} name={row.wrestlerName} ring={row.isLeader ? 'pink' : 'none'} />

                <div className="group-person__text faction-members__identity">
                  <h3 className="faction-members__name">{row.wrestlerName}</h3>
                  <span className="group-muted">{row.playerName}</span>
                </div>

                <div className="faction-members__role">
                  {row.isLeader && <Badge tone="pink">{t('factions.members.roleLeader', 'LEADER')}</Badge>}
                </div>

                <div className="faction-members__record">
                  <strong>{formatRecord(row.wins, row.losses, row.draws)}</strong>
                  <span className="group-muted">
                    {row.winPercentage > 0 ? `${row.winPercentage.toFixed(1)}%` : '—'}
                  </span>
                </div>

                <div className="faction-members__form">
                  <GroupFormCell recentForm={row.recentForm.slice(0, 5)} currentStreak={row.currentStreak} />
                </div>

                <div className="faction-members__actions" ref={isMenuOpen ? menuContainerRef : null}>
                  <button
                    type="button"
                    className="faction-members__menu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    aria-label={t('factions.members.menuLabel', 'Actions for {{name}}', { name: row.wrestlerName })}
                    onClick={() => setOpenMenuFor(isMenuOpen ? null : row.playerId)}
                  >
                    <MoreHorizontal aria-hidden="true" size={20} />
                  </button>
                  {isMenuOpen && (
                    <div role="menu" className="faction-members__menu">
                      <Link
                        to={`/player/${row.playerId}`}
                        className="faction-members__menu-item"
                        role="menuitem"
                        onClick={() => setOpenMenuFor(null)}
                      >
                        {t('factions.members.actionViewProfile', 'View profile')}
                      </Link>
                      <Link
                        to={`/factions/${faction.stableId}/messages?dm=${row.playerId}`}
                        className="faction-members__menu-item"
                        role="menuitem"
                        onClick={() => setOpenMenuFor(null)}
                      >
                        {t('factions.members.actionDm', 'Send direct message')}
                      </Link>
                      {isLeader && !row.isLeader && (
                        <button
                          type="button"
                          role="menuitem"
                          className="faction-members__menu-item faction-members__menu-item--destructive"
                          onClick={() => {
                            setOpenMenuFor(null);
                            setMemberToRemove({ playerId: row.playerId, playerName: row.wrestlerName, mode: 'remove' });
                            setRemoveError(null);
                          }}
                        >
                          {t('factions.members.actionRemove', 'Remove from faction')}
                        </button>
                      )}
                      {/* Leaders disband from Manage instead of leaving. */}
                      {!row.isLeader && row.playerId === auth.playerId && (
                        <button
                          type="button"
                          role="menuitem"
                          className="faction-members__menu-item faction-members__menu-item--destructive"
                          onClick={() => {
                            setOpenMenuFor(null);
                            setMemberToRemove({ playerId: row.playerId, playerName: row.wrestlerName, mode: 'leave' });
                            setRemoveError(null);
                          }}
                        >
                          {t('factions.members.actionLeave', 'Leave faction')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
      <section className="group-section" aria-labelledby="faction-members-totals">
        <h2 id="faction-members-totals" className="group-heading">
          {t('factions.members.totalsTitle', 'Faction Totals')}
        </h2>
        <dl className="group-stats">
          <div>
            <dt>{t('factions.hub.statWins', 'WINS')}</dt>
            <dd>{totals.wins}</dd>
          </div>
          <div>
            <dt>{t('factions.hub.statLosses', 'LOSSES')}</dt>
            <dd>{totals.losses}</dd>
          </div>
          <div>
            <dt>{t('factions.hub.statDraws', 'DRAWS')}</dt>
            <dd>{totals.draws}</dd>
          </div>
          <div>
            <dt>{t('factions.hub.statWinPct', 'WIN%')}</dt>
            <dd>{totals.winPct}%</dd>
          </div>
        </dl>

        <div className="faction-members__callouts">
          {bestPerformer && (
            <div className="group-person">
              <Avatar src={bestPerformer.imageUrl} name={bestPerformer.wrestlerName} size="sm" />
              <span className="group-person__text">
                <span className="group-muted">{t('factions.members.bestPerformer', 'BEST PERFORMER')}</span>
                <span className="group-person__name">
                  {bestPerformer.wrestlerName}
                  {' · '}
                  {bestPerformer.winPercentage > 0 ? `${bestPerformer.winPercentage.toFixed(1)}%` : '—'}
                </span>
              </span>
            </div>
          )}
          {needsSupport && needsSupport.playerId !== bestPerformer?.playerId && (
            <div className="group-person">
              <Avatar src={needsSupport.imageUrl} name={needsSupport.wrestlerName} size="sm" />
              <span className="group-person__text">
                <span className="group-muted">{t('factions.members.needsSupport', 'NEEDS SUPPORT')}</span>
                <span className="group-person__name">
                  {needsSupport.wrestlerName}
                  {' · '}
                  {needsSupport.recentForm.length > 0 ? needsSupport.recentForm.join(' ') : '—'}
                </span>
              </span>
            </div>
          )}
        </div>
      </section>
      )}

      {inviteOpen && (
        <InviteToFactionModal
          isOpen={inviteOpen}
          stableId={faction.stableId}
          currentMemberIds={faction.memberIds}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false);
            setReloadKey((key) => key + 1);
          }}
        />
      )}

      {memberToRemove && (
        <RemoveMemberModal
          factionName={faction.name}
          playerName={memberToRemove.playerName}
          willDisband={willDisband}
          error={removeError}
          busy={removing}
          mode={memberToRemove.mode}
          onCancel={() => {
            setMemberToRemove(null);
            setRemoveError(null);
          }}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}
