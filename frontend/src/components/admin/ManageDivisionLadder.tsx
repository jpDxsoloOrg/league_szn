import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { divisionLadderApi, playersApi } from '../../services/api';
import type { Division, DivisionLadderRules, DivisionMovement, Player } from '../../types';
import Skeleton from '../ui/Skeleton';
import './ManageDivisionLadder.css';

const RULE_MIN = 2;
const RULE_MAX = 20;

const DEFAULT_RULES: DivisionLadderRules = {
  enabled: true,
  promoteWinStreak: 5,
  demoteLossStreak: 5,
};

type StreakRuleKey = 'promoteWinStreak' | 'demoteLossStreak';

/** Split divisions into the ranked ladder (bottom → top) and unranked leftovers. */
function splitDivisions(divisions: Division[]): { ladder: Division[]; unranked: Division[] } {
  const ranked = divisions
    .filter((division) => typeof division.rank === 'number')
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const unranked = divisions
    .filter((division) => typeof division.rank !== 'number')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { ladder: ranked, unranked };
}

function clampRule(value: number): number {
  return Math.min(RULE_MAX, Math.max(RULE_MIN, Math.round(value)));
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString();
}

export default function ManageDivisionLadder() {
  const { t } = useTranslation();
  /** Ladder order bottom → top (index 0 = rank 0 = jobber tier). */
  const [ladder, setLadder] = useState<Division[]>([]);
  const [unranked, setUnranked] = useState<Division[]>([]);
  const [rules, setRules] = useState<DivisionLadderRules>(DEFAULT_RULES);
  /** Raw text of the streak inputs so the admin can clear a field before typing a new value. */
  const [ruleDrafts, setRuleDrafts] = useState<Record<StreakRuleKey, string>>({
    promoteWinStreak: String(DEFAULT_RULES.promoteWinStreak),
    demoteLossStreak: String(DEFAULT_RULES.demoteLossStreak),
  });
  const [movements, setMovements] = useState<DivisionMovement[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        const response = await divisionLadderApi.get(controller.signal);
        if (cancelled) return;
        const split = splitDivisions(response.divisions);
        setLadder(split.ladder);
        setUnranked(split.unranked);
        applyRules(response.rules);
        setMovements(response.recentMovements);
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
        setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    playersApi
      .getAll(controller.signal)
      .then((data) => {
        if (!cancelled) setPlayers(data);
      })
      .catch(() => {
        // Player names are a nicety for the movements table; fall back to IDs.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const divisionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const division of [...ladder, ...unranked]) {
      map.set(division.divisionId, division.name);
    }
    return map;
  }, [ladder, unranked]);

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of players) {
      map.set(player.playerId, player.name);
    }
    return map;
  }, [players]);

  /** Swap a ladder entry with its neighbour. `delta` +1 moves toward the top (higher rank). */
  const moveInLadder = (index: number, delta: 1 | -1) => {
    setLadder((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const current = prev[index];
      const neighbour = prev[target];
      if (!current || !neighbour) return prev;
      const next = [...prev];
      next[index] = neighbour;
      next[target] = current;
      return next;
    });
    setSuccess(null);
  };

  const addToLadder = (division: Division) => {
    setUnranked((prev) => prev.filter((item) => item.divisionId !== division.divisionId));
    setLadder((prev) => [division, ...prev]);
    setSuccess(null);
  };

  const handleRuleChange = (key: StreakRuleKey, raw: string) => {
    setRuleDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    setRules((prev) => ({ ...prev, [key]: clampRule(parsed) }));
  };

  /** On blur, snap the draft to the clamped value (or back to the last valid value if empty). */
  const handleRuleBlur = (key: StreakRuleKey) => {
    const parsed = Number.parseInt(ruleDrafts[key], 10);
    const committed = Number.isNaN(parsed) ? rules[key] : clampRule(parsed);
    setRules((prev) => ({ ...prev, [key]: committed }));
    setRuleDrafts((prev) => ({ ...prev, [key]: String(committed) }));
  };

  function applyRules(next: DivisionLadderRules) {
    setRules(next);
    setRuleDrafts({
      promoteWinStreak: String(next.promoteWinStreak),
      demoteLossStreak: String(next.demoteLossStreak),
    });
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await divisionLadderApi.update({
        rules: {
          enabled: rules.enabled,
          promoteWinStreak: clampRule(rules.promoteWinStreak),
          demoteLossStreak: clampRule(rules.demoteLossStreak),
        },
        order: ladder.map((division) => division.divisionId),
      });
      const split = splitDivisions(response.divisions);
      setLadder(split.ladder);
      setUnranked(split.unranked);
      applyRules(response.rules);
      setMovements(response.recentMovements);
      setSuccess(t('admin.divisionLadder.saved'));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('admin.divisionLadder.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  // Render highest rank first.
  const ladderTopDown = [...ladder].reverse();

  return (
    <div className="manage-division-ladder">
      <div className="ladder-header">
        <h2>{t('admin.divisionLadder.title')}</h2>
        <p className="ladder-subtitle">{t('admin.divisionLadder.subtitle')}</p>
      </div>

      {loadFailed && (
        <div className="error-message" role="alert">{t('admin.divisionLadder.loadError')}</div>
      )}
      {error && <div className="error-message" role="alert">{error}</div>}
      {success && <div className="success-message" role="status">{success}</div>}

      <section className="ladder-card">
        <h3>{t('admin.divisionLadder.orderTitle')}</h3>
        <p className="ladder-help">{t('admin.divisionLadder.orderHelp')}</p>

        {ladderTopDown.length > 0 && (
          <ol className="ladder-list" aria-label={t('admin.divisionLadder.orderTitle')}>
            {ladderTopDown.map((division, displayIndex) => {
              const ladderIndex = ladder.length - 1 - displayIndex;
              const isTop = displayIndex === 0;
              const isBottom = displayIndex === ladderTopDown.length - 1;
              return (
                <li key={division.divisionId} className="ladder-row">
                  <div className="ladder-row-main">
                    <span className="ladder-rank-badge">
                      {t('admin.divisionLadder.rankBadge', { rank: ladderIndex })}
                    </span>
                    <span className="ladder-row-name">{division.name}</span>
                    {isTop && (
                      <span className="ladder-caption ladder-caption--top">
                        {t('admin.divisionLadder.topTierCaption')}
                      </span>
                    )}
                    {isBottom && (
                      <span className="ladder-caption ladder-caption--bottom">
                        {t('admin.divisionLadder.bottomTierCaption')}
                      </span>
                    )}
                  </div>
                  <div className="ladder-row-actions">
                    <button
                      type="button"
                      className="ladder-move-btn"
                      onClick={() => moveInLadder(ladderIndex, 1)}
                      disabled={isTop || saving}
                      aria-label={`${t('admin.divisionLadder.moveUp')}: ${division.name}`}
                      title={t('admin.divisionLadder.moveUp')}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="ladder-move-btn"
                      onClick={() => moveInLadder(ladderIndex, -1)}
                      disabled={isBottom || saving}
                      aria-label={`${t('admin.divisionLadder.moveDown')}: ${division.name}`}
                      title={t('admin.divisionLadder.moveDown')}
                    >
                      ▼
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {unranked.length > 0 && (
          <div className="ladder-unranked">
            <h4>{t('admin.divisionLadder.unrankedTitle')}</h4>
            <ul className="ladder-unranked-list">
              {unranked.map((division) => (
                <li key={division.divisionId} className="ladder-row ladder-row--unranked">
                  <span className="ladder-row-name">{division.name}</span>
                  <button
                    type="button"
                    className="ladder-add-btn"
                    onClick={() => addToLadder(division)}
                    disabled={saving}
                  >
                    {t('admin.divisionLadder.addToLadder')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="ladder-card">
        <h3>{t('admin.divisionLadder.rulesTitle')}</h3>
        <div className="ladder-rules">
          <label className="ladder-checkbox-label" htmlFor="ladder-enabled">
            <input
              id="ladder-enabled"
              type="checkbox"
              checked={rules.enabled}
              onChange={(event) => setRules((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            {t('admin.divisionLadder.enabled')}
          </label>

          <div className="ladder-rule-field">
            <label className="ladder-rule-label" htmlFor="ladder-promote">
              {t('admin.divisionLadder.promoteWinStreak')}
            </label>
            <input
              id="ladder-promote"
              type="number"
              className="ladder-rule-input"
              min={RULE_MIN}
              max={RULE_MAX}
              step={1}
              value={ruleDrafts.promoteWinStreak}
              onChange={(event) => handleRuleChange('promoteWinStreak', event.target.value)}
              onBlur={() => handleRuleBlur('promoteWinStreak')}
            />
            <span className="ladder-rule-hint">
              {t('admin.divisionLadder.promoteHelp', { count: rules.promoteWinStreak })}
            </span>
          </div>

          <div className="ladder-rule-field">
            <label className="ladder-rule-label" htmlFor="ladder-demote">
              {t('admin.divisionLadder.demoteLossStreak')}
            </label>
            <input
              id="ladder-demote"
              type="number"
              className="ladder-rule-input"
              min={RULE_MIN}
              max={RULE_MAX}
              step={1}
              value={ruleDrafts.demoteLossStreak}
              onChange={(event) => handleRuleChange('demoteLossStreak', event.target.value)}
              onBlur={() => handleRuleBlur('demoteLossStreak')}
            />
            <span className="ladder-rule-hint">
              {t('admin.divisionLadder.demoteHelp', { count: rules.demoteLossStreak })}
            </span>
          </div>
        </div>
      </section>

      <div className="ladder-actions">
        <button type="button" className="ladder-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? t('common.saving', 'Saving...') : t('admin.divisionLadder.save')}
        </button>
      </div>

      <section className="ladder-card">
        <h3>{t('admin.divisionLadder.movementsTitle')}</h3>
        {movements.length === 0 ? (
          <p className="ladder-empty">{t('admin.divisionLadder.movementsEmpty')}</p>
        ) : (
          <div className="ladder-table-wrap">
            <table className="ladder-movements-table">
              <thead>
                <tr>
                  <th>{t('admin.divisionLadder.colDate')}</th>
                  <th>{t('admin.divisionLadder.colPlayer')}</th>
                  <th>{t('admin.divisionLadder.colFrom')}</th>
                  <th>{t('admin.divisionLadder.colTo')}</th>
                  <th>{t('admin.divisionLadder.colDirection')}</th>
                  <th>{t('admin.divisionLadder.colTrigger')}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.movementId}>
                    <td>{formatDate(movement.movedAt)}</td>
                    <td>{playerNameById.get(movement.playerId) ?? movement.playerId}</td>
                    <td>
                      {movement.fromDivisionId
                        ? divisionNameById.get(movement.fromDivisionId) ?? movement.fromDivisionId
                        : '—'}
                    </td>
                    <td>{divisionNameById.get(movement.toDivisionId) ?? movement.toDivisionId}</td>
                    <td>
                      <span className={`ladder-direction-badge ladder-direction-badge--${movement.direction}`}>
                        {t(`admin.divisionLadder.direction.${movement.direction}`)}
                      </span>
                    </td>
                    <td>{t(`admin.divisionLadder.trigger.${movement.trigger}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
