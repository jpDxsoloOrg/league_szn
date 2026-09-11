import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playersApi } from '../../services/api';
import type { Player, PlayerBookingInfo, PlayerSuspension, SuspensionRow } from '../../types';
import { formatShortDate } from '../../utils/bookingRecency';
import PlayerBookingPicker from '../events/PlayerBookingPicker';
import Skeleton from '../ui/Skeleton';
import ReinstatePlayerDialog, { EligibilityBadge } from './ReinstatePlayerDialog';
import SuspendPlayerDialog, { type SuspensionDialogPlayer } from './SuspendPlayerDialog';
import { formatSuspensionCondition, formatSuspensionProgress } from './suspensionFormat';
import './ManageSuspensions.css';

interface ReinstateTarget {
  player: SuspensionDialogPlayer;
  suspension: PlayerSuspension;
  row?: SuspensionRow;
}

export default function ManageSuspensions() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [bookingInfo, setBookingInfo] = useState<Map<string, PlayerBookingInfo> | undefined>(undefined);
  const [rows, setRows] = useState<SuspensionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<SuspensionDialogPlayer | null>(null);
  const [reinstateTarget, setReinstateTarget] = useState<ReinstateTarget | null>(null);

  const load = useCallback(async () => {
    try {
      const [playerList, summary, suspensionRows] = await Promise.all([
        playersApi.getAll(),
        playersApi.getBookingSummary().catch(() => undefined),
        playersApi.getSuspensions(),
      ]);
      setPlayers(playerList);
      setBookingInfo(summary ? new Map(Object.entries(summary)) : undefined);
      setRows(suspensionRows);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePick = (playerId: string) => {
    if (!playerId) return;
    const player = players.find((p) => p.playerId === playerId);
    if (!player) return;
    setSuccess(null);
    if (player.suspension) {
      setReinstateTarget({
        player,
        suspension: player.suspension,
        row: rows.find((r) => r.playerId === playerId),
      });
    } else {
      setSuspendTarget(player);
    }
  };

  const openReinstateFromRow = (row: SuspensionRow) => {
    setSuccess(null);
    setReinstateTarget({ player: row, suspension: row.suspension, row });
  };

  const handleSuspended = async (updated: Player) => {
    setSuspendTarget(null);
    setSuccess(t('admin.suspensions.suspendedSuccess', { name: updated.name }));
    await load();
  };

  const handleReinstated = async (updated: Player) => {
    setReinstateTarget(null);
    setSuccess(t('admin.suspensions.reinstatedSuccess', { name: updated.name }));
    await load();
  };

  if (loading) {
    return <Skeleton variant="block" count={3} />;
  }

  return (
    <div className="manage-suspensions">
      <div className="suspensions-header">
        <h2>{t('admin.suspensions.title')}</h2>
        <p className="suspensions-subtitle">{t('admin.suspensions.subtitle')}</p>
      </div>

      {loadFailed && (
        <div className="error-message" role="alert">{t('admin.suspensions.loadError')}</div>
      )}
      {success && <div className="success-message" role="status">{success}</div>}

      <div className="suspensions-search">
        <label htmlFor="suspensions-search-picker">{t('admin.suspensions.searchLabel')}</label>
        <PlayerBookingPicker
          id="suspensions-search-picker"
          mode="single"
          players={players}
          value=""
          onChange={handlePick}
          bookingInfoByPlayerId={bookingInfo}
          placeholder={t('admin.suspensions.searchPlaceholder')}
        />
      </div>

      <section className="suspensions-current">
        <h3>{t('admin.suspensions.currentTitle')}</h3>
        {rows.length === 0 ? (
          <p className="no-data">{t('admin.suspensions.currentEmpty')}</p>
        ) : (
          <div className="suspensions-table-wrap">
            <table className="suspensions-table">
              <thead>
                <tr>
                  <th>{t('admin.suspensions.colPlayer')}</th>
                  <th>{t('admin.suspensions.colSince')}</th>
                  <th>{t('admin.suspensions.colCondition')}</th>
                  <th>{t('admin.suspensions.colProgress')}</th>
                  <th>{t('admin.suspensions.colStatus')}</th>
                  <th>{t('admin.suspensions.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.playerId}>
                    <td>
                      <span className="suspensions-player-cell">
                        {row.imageUrl && (
                          <img className="suspensions-player-avatar" src={row.imageUrl} alt="" />
                        )}
                        <span className="suspensions-player-text">
                          <span className="suspensions-player-wrestler">{row.currentWrestler}</span>
                          <span className="suspensions-player-name">{row.name}</span>
                        </span>
                      </span>
                    </td>
                    <td>{formatShortDate(row.suspension.suspendedAt)}</td>
                    <td>{formatSuspensionCondition(row.suspension, t)}</td>
                    <td>{formatSuspensionProgress(row.suspension, row.showsServed, t)}</td>
                    <td><EligibilityBadge eligible={row.eligibleForReinstatement} /></td>
                    <td>
                      <button
                        type="button"
                        className="suspensions-reinstate-btn"
                        onClick={() => openReinstateFromRow(row)}
                      >
                        {t('admin.suspensions.reinstate')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {suspendTarget && (
        <SuspendPlayerDialog
          player={suspendTarget}
          onSuccess={handleSuspended}
          onClose={() => setSuspendTarget(null)}
        />
      )}

      {reinstateTarget && (
        <ReinstatePlayerDialog
          player={reinstateTarget.player}
          suspension={reinstateTarget.suspension}
          row={reinstateTarget.row}
          onSuccess={handleReinstated}
          onClose={() => setReinstateTarget(null)}
        />
      )}
    </div>
  );
}
