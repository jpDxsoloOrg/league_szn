import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Flag } from 'lucide-react';
import type { Division, Season } from '../../../types';
import type {
  SeasonMovementChoice,
  SeasonMovementReviewView,
  SeasonReviewApplyResult,
  SeasonReviewDecisionInput,
  SeasonReviewList,
} from '../../../types/progression';
import { progressionApi, seasonsApi, SEASON_REVIEW_BATCH_MAX } from '../../../services/api';
import { divisionTierSortValue } from '../../../utils/divisionTiers';
import Badge from '../../ui/Badge';
import type { BadgeTone } from '../../ui/Badge';
import Button from '../../ui/Button';
import DataTable from '../../ui/DataTable';
import EmptyState from '../../ui/EmptyState';
import Select from '../../ui/Select';
import Skeleton from '../../ui/Skeleton';
import AdminNotice from '../AdminNotice';
import useAdminConfirm from '../useAdminConfirm';
import {
  buildDecisions,
  chunk,
  initialDraft,
  isApplied,
  isMove,
  isPending,
  targetChoice,
  unavailableReason,
  withResult,
} from './seasonReviewModel';
import type { DecisionDraft, DivisionChoice } from './seasonReviewModel';

const CHOICES: readonly SeasonMovementChoice[] = ['promote', 'relegate', 'stay'];

const RECOMMENDATION_TONE: Record<SeasonMovementChoice, BadgeTone> = {
  promote: 'win',
  relegate: 'loss',
  stay: 'neutral',
};

/** Completed seasons first, newest first; the review is taken when a season ends. */
function sortSeasons(seasons: readonly Season[]): Season[] {
  return [...seasons].sort((first, second) => {
    if (first.status !== second.status) return first.status === 'completed' ? -1 : 1;
    return (second.endDate ?? second.startDate).localeCompare(first.endDate ?? first.startDate);
  });
}

function isChoice(value: string): value is SeasonMovementChoice {
  return CHOICES.some((choice) => choice === value);
}

export interface SeasonReviewProps {
  divisions: Division[];
}

/**
 * End-of-season movement review (DMV-03): every player in the season-end
 * snapshot with the recommendation, a decision, and a bulk apply with a result
 * per row. Relegation progress comes from the API, which already leaves out
 * losses in hot-angle rivalries.
 */
export default function SeasonReview({ divisions }: SeasonReviewProps) {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [list, setList] = useState<SeasonReviewList | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [divisionFilter, setDivisionFilter] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DecisionDraft>>({});
  const [results, setResults] = useState<Record<string, SeasonReviewApplyResult>>({});
  const [candidates, setCandidates] = useState<Record<string, DivisionChoice[]>>({});
  const [missingTarget, setMissingTarget] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<{ applied: number; failed: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setSeasonsLoading(true);
      try {
        const data = sortSeasons(await seasonsApi.getAll(controller.signal));
        if (controller.signal.aborted) return;
        setSeasons(data);
        setSeasonId((current) => current || data[0]?.seasonId || '');
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setSeasonsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!seasonId) return undefined;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setResults({});
      setCandidates({});
      setMissingTarget(new Set());
      setSummary(null);
      try {
        const data = await progressionApi.getSeasonReviews(seasonId, controller.signal);
        if (controller.signal.aborted) return;
        setList(data);
        setDrafts(Object.fromEntries(data.reviews.map((review) => [review.playerId, initialDraft(review)])));
      } catch (err) {
        if (controller.signal.aborted) return;
        setList(null);
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [seasonId, retryKey]);

  const divisionName = (divisionId: string | undefined) => (divisionId
    ? divisions.find((division) => division.divisionId === divisionId)?.name ?? divisionId
    : '');

  const tierOf = useMemo(() => {
    const byId = new Map(divisions.map((division) => [division.divisionId, divisionTierSortValue(division)]));
    return (divisionId: string) => byId.get(divisionId) ?? Number.MAX_SAFE_INTEGER;
  }, [divisions]);

  const reviews = list?.reviews;
  const rows = useMemo(() => {
    const all = reviews ?? [];
    const filtered = divisionFilter ? all.filter((review) => review.divisionId === divisionFilter) : all;
    return [...filtered].sort((first, second) => (
      tierOf(first.divisionId) - tierOf(second.divisionId)
      || divisionName(first.divisionId).localeCompare(divisionName(second.divisionId))
      || (first.seasonRank ?? Number.MAX_SAFE_INTEGER) - (second.seasonRank ?? Number.MAX_SAFE_INTEGER)
      || first.playerName.localeCompare(second.playerName)
    ));
    // divisionName reads `divisions`, which tierOf already tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, divisionFilter, tierOf]);

  const divisionOptions = useMemo(() => {
    const ids = [...new Set((reviews ?? []).map((review) => review.divisionId))];
    ids.sort((first, second) => tierOf(first) - tierOf(second));
    return [
      { value: '', label: t('progression.admin.review.allDivisions') },
      ...ids.map((divisionId) => ({ value: divisionId, label: divisionName(divisionId) })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, tierOf, t]);

  const pendingCount = rows.filter((review) => isPending(review, drafts[review.playerId])).length;

  const updateDraft = (playerId: string, change: Partial<DecisionDraft>) => {
    setDrafts((previous) => {
      const current = previous[playerId] ?? { decision: '', toDivisionId: '', announce: false };
      return { ...previous, [playerId]: { ...current, ...change } };
    });
    setMissingTarget((previous) => {
      if (!previous.has(playerId)) return previous;
      const next = new Set(previous);
      next.delete(playerId);
      return next;
    });
  };

  /** Sends decisions in API-sized batches and records a result per row. */
  const send = async (decisions: SeasonReviewDecisionInput[]) => {
    if (!list) return;
    const collected: SeasonReviewApplyResult[] = [];
    for (const batch of chunk(decisions, SEASON_REVIEW_BATCH_MAX)) {
      try {
        const response = await progressionApi.applySeasonReviews(list.seasonId, batch);
        collected.push(...response.results);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        collected.push(...batch.map((decision): SeasonReviewApplyResult => ({
          playerId: decision.playerId,
          decision: decision.decision,
          ok: false,
          refusal: { status: 0, message, details: { code: 'REQUEST_FAILED' } },
        })));
      }
    }
    const byPlayer = new Map(collected.map((result) => [result.playerId, result]));
    setResults((previous) => ({ ...previous, ...Object.fromEntries(byPlayer) }));
    setList((previous) => (previous ? {
      ...previous,
      reviews: previous.reviews.map((review) => {
        const result = byPlayer.get(review.playerId);
        return result ? withResult(review, result) : review;
      }),
    } : previous));
    const ambiguous = collected.flatMap((result) => (
      !result.ok && result.refusal.details?.code === 'AMBIGUOUS_TARGET' && result.refusal.details.candidates
        ? [[result.playerId, result.refusal.details.candidates] as const]
        : []
    ));
    if (ambiguous.length > 0) {
      setCandidates((previous) => ({ ...previous, ...Object.fromEntries(ambiguous) }));
      setDrafts((previous) => {
        const next = { ...previous };
        for (const [playerId] of ambiguous) {
          const draft = next[playerId];
          if (draft) next[playerId] = { ...draft, toDivisionId: '' };
        }
        return next;
      });
    }
    const applied = collected.filter((result) => result.ok).length;
    setSummary({ applied, failed: collected.length - applied });
  };

  const handleApply = async () => {
    const built = buildDecisions(rows, drafts, divisions, candidates);
    setMissingTarget(new Set(built.missingTarget));
    if (built.missingTarget.length > 0) {
      setSummary(null);
      return;
    }
    if (built.decisions.length === 0) return;
    const count = (choice: SeasonMovementChoice) => built.decisions.filter((decision) => decision.decision === choice).length;
    const confirmed = await confirm({
      title: t('progression.admin.review.confirmTitle', { count: built.decisions.length }),
      description: t('progression.admin.review.confirmText', {
        promote: count('promote'),
        relegate: count('relegate'),
        stay: count('stay'),
      }),
      confirmLabel: t('progression.admin.review.apply'),
      danger: false,
    });
    if (!confirmed) return;
    setApplying(true);
    try {
      await send(built.decisions);
    } finally {
      setApplying(false);
    }
  };

  const handleForce = async (review: SeasonMovementReviewView, titles: string[]) => {
    const draft = drafts[review.playerId];
    const result = results[review.playerId];
    if (!draft || !result || !isMove(result.decision)) return;
    const confirmed = await confirm({
      title: t('progression.admin.review.forceTitle', { name: review.playerName }),
      description: t('progression.admin.review.forceText', { name: review.playerName, titles: titles.join(', ') }),
      confirmLabel: t('progression.admin.execute.proceedAnyway'),
    });
    if (!confirmed) return;
    const target = targetChoice(review, result.decision, divisions, candidates[review.playerId]);
    setApplying(true);
    try {
      await send([{
        playerId: review.playerId,
        decision: result.decision,
        ...(target.type === 'pick' && draft.toDivisionId ? { toDivisionId: draft.toDivisionId } : {}),
        announce: draft.announce,
        force: true,
      }]);
    } finally {
      setApplying(false);
    }
  };

  const renderDecision = (review: SeasonMovementReviewView) => {
    if (isApplied(review)) {
      return <span className="ac-cell__title">{t(`progression.admin.review.decided.${review.decision ?? 'stay'}`)}</span>;
    }
    const draft = drafts[review.playerId];
    return (
      <select
        className="mp-review__select"
        aria-label={t('progression.admin.review.decisionFor', { name: review.playerName })}
        value={draft?.decision ?? ''}
        disabled={applying}
        onChange={(event) => {
          const { value } = event.target;
          updateDraft(review.playerId, { decision: isChoice(value) ? value : '', toDivisionId: '' });
        }}
      >
        <option value="">{t('progression.admin.review.noDecision')}</option>
        {CHOICES.map((choice) => {
          const reason = unavailableReason(review, choice);
          return (
            <option key={choice} value={choice} disabled={reason !== null}>
              {reason === null
                ? t(`progression.admin.review.choices.${choice}`)
                : t('progression.admin.review.choiceUnavailable', {
                  choice: t(`progression.admin.review.choices.${choice}`),
                  reason: t(`progression.admin.review.reasons.${reason}`, { defaultValue: reason }),
                })}
            </option>
          );
        })}
      </select>
    );
  };

  const renderTarget = (review: SeasonMovementReviewView) => {
    if (isApplied(review)) {
      return review.toDivisionId
        ? <span className="ac-cell__text">{divisionName(review.toDivisionId)}</span>
        : <span className="ac-cell__muted">—</span>;
    }
    const draft = drafts[review.playerId];
    if (!draft || !isMove(draft.decision)) return <span className="ac-cell__muted">—</span>;
    const target = targetChoice(review, draft.decision, divisions, candidates[review.playerId]);
    return (
      <div className="mp-review__target">
        {target.type === 'fixed' && <span className="ac-cell__text">{divisionName(target.divisionId)}</span>}
        {target.type === 'pick' && (
          <select
            className="mp-review__select"
            aria-label={t('progression.admin.review.targetFor', { name: review.playerName })}
            value={draft.toDivisionId}
            disabled={applying}
            onChange={(event) => updateDraft(review.playerId, { toDivisionId: event.target.value })}
          >
            <option value="">{t('progression.admin.review.pickTarget')}</option>
            {target.options.map((option) => <option key={option.divisionId} value={option.divisionId}>{option.name}</option>)}
          </select>
        )}
        {missingTarget.has(review.playerId) && (
          <span className="mp-field-error" role="alert">{t('progression.admin.execute.targetRequired')}</span>
        )}
        <label className="ac-check">
          <input
            type="checkbox"
            checked={draft.announce}
            disabled={applying}
            onChange={(event) => updateDraft(review.playerId, { announce: event.target.checked })}
          />
          {t('progression.admin.review.announce')}
        </label>
      </div>
    );
  };

  const renderResult = (review: SeasonMovementReviewView) => {
    const result = results[review.playerId];
    if (!result) {
      if (isApplied(review)) return <Badge tone="neutral">{t('progression.admin.review.alreadyApplied')}</Badge>;
      return <span className="ac-cell__muted">—</span>;
    }
    if (result.ok) {
      return (
        <span className="ac-cell__text" data-testid="review-result">
          <Badge tone="win">{t('progression.admin.review.applied')}</Badge>
          {result.move && (
            <span className="ac-cell__sub">
              {t('progression.admin.review.movedTo', { division: divisionName(result.move.toDivisionId) })}
            </span>
          )}
        </span>
      );
    }
    const code = result.refusal.details?.code ?? 'UNKNOWN';
    const titles = (result.refusal.details?.championships ?? []).map((championship) => championship.name);
    return (
      <span className="ac-cell__text mp-review__refusal" data-testid="review-result">
        <Badge tone="loss">{t('progression.admin.review.notApplied')}</Badge>
        <span className="ac-cell__sub">
          {t(`progression.admin.review.refusals.${code}`, { name: review.playerName, defaultValue: result.refusal.message })}
        </span>
        {titles.length > 0 && <span className="ac-cell__sub">{titles.join(', ')}</span>}
        {code === 'HOLDS_DIVISION_TITLE' && (
          <Button variant="danger" size="sm" disabled={applying} onClick={() => void handleForce(review, titles)}>
            {t('progression.admin.execute.proceedAnyway')}
          </Button>
        )}
      </span>
    );
  };

  if (seasonsLoading) return <Skeleton variant="table" />;

  if (seasons.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck aria-hidden="true" size={32} />}
        title={loadError ? t('progression.admin.review.loadFailed', { message: loadError }) : t('progression.admin.review.noSeasons')}
      />
    );
  }

  return (
    <div className="mp-section mp-review">
      <div className="ac-toolbar mp-track-picker">
        <Select
          label={t('progression.admin.review.season')}
          value={seasonId}
          onValueChange={setSeasonId}
          options={seasons.map((season) => ({
            value: season.seasonId,
            label: season.status === 'active'
              ? t('progression.admin.review.activeSeason', { name: season.name })
              : season.name,
          }))}
        />
        {(reviews?.length ?? 0) > 0 && (
          <Select
            label={t('progression.admin.review.division')}
            value={divisionFilter}
            onValueChange={setDivisionFilter}
            options={divisionOptions}
          />
        )}
        <span className="ac-toolbar__spacer" />
        <Button onClick={() => void handleApply()} loading={applying} disabled={pendingCount === 0 || loading}>
          {t('progression.admin.review.applyCount', { count: pendingCount })}
        </Button>
      </div>

      <p className="ac-field__hint">{t('progression.admin.review.intro')}</p>

      {summary && (
        <AdminNotice tone={summary.failed > 0 ? 'warning' : 'success'}>
          {t('progression.admin.review.summary', { applied: summary.applied, failed: summary.failed })}
        </AdminNotice>
      )}
      {missingTarget.size > 0 && (
        <AdminNotice tone="error">{t('progression.admin.review.missingTargets', { count: missingTarget.size })}</AdminNotice>
      )}

      {loadError ? (
        <AdminNotice
          tone="error"
          action={<Button variant="ghost" size="sm" onClick={() => setRetryKey((key) => key + 1)}>{t('common.retry', 'Retry')}</Button>}
        >
          {t('progression.admin.review.loadFailed', { message: loadError })}
        </AdminNotice>
      ) : (
        <DataTable
          caption={t('progression.admin.review.caption')}
          density="dense"
          loading={loading}
          rows={rows}
          rowKey={(review) => review.playerId}
          empty={(
            <EmptyState
              icon={<CalendarCheck aria-hidden="true" size={32} />}
              title={t(list?.seasonStatus === 'active' ? 'progression.admin.review.emptyActive' : 'progression.admin.review.empty')}
            />
          )}
          columns={[
            {
              key: 'player',
              header: t('progression.admin.review.columns.player'),
              sortValue: (review) => review.playerName,
              render: (review) => (
                <span className="ac-cell__text">
                  <span className="ac-cell__title">{review.playerName}</span>
                  {review.currentWrestler && <span className="ac-cell__sub">{review.currentWrestler}</span>}
                </span>
              ),
            },
            {
              key: 'division',
              header: t('progression.admin.review.columns.division'),
              sortValue: (review) => tierOf(review.divisionId),
              render: (review) => (
                <span className="ac-cell__text">
                  <span>{divisionName(review.divisionId)}</span>
                  {review.currentDivisionId && review.currentDivisionId !== review.divisionId && (
                    <span className="ac-cell__sub">{t('progression.admin.review.nowIn', { division: divisionName(review.currentDivisionId) })}</span>
                  )}
                </span>
              ),
            },
            {
              key: 'standing',
              header: t('progression.admin.review.columns.standing'),
              sortValue: (review) => review.seasonRank ?? Number.MAX_SAFE_INTEGER,
              render: (review) => (
                <span className="ac-cell__text">
                  <span>{review.seasonRank ? t('progression.admin.review.rank', { rank: review.seasonRank }) : t('progression.admin.review.unranked')}</span>
                  <span className="ac-cell__sub">
                    {t('progression.admin.review.progress', { promotion: review.promotionPct, relegation: review.relegationPct })}
                  </span>
                </span>
              ),
            },
            {
              key: 'recommendation',
              header: t('progression.admin.review.columns.recommendation'),
              sortValue: (review) => review.recommendation,
              render: (review) => (
                <span className="mp-review__badges">
                  <Badge tone={RECOMMENDATION_TONE[review.recommendation]}>
                    {t(`progression.admin.review.choices.${review.recommendation}`)}
                  </Badge>
                  {review.flagged && (
                    <Badge tone="warning" icon={<Flag aria-hidden="true" size={14} />}>
                      {t('progression.admin.board.flagged')}
                    </Badge>
                  )}
                </span>
              ),
            },
            {
              key: 'decision',
              header: t('progression.admin.review.columns.decision'),
              render: renderDecision,
            },
            {
              key: 'target',
              header: t('progression.admin.review.columns.target'),
              render: renderTarget,
            },
            {
              key: 'result',
              header: t('progression.admin.review.columns.result'),
              render: renderResult,
            },
          ]}
        />
      )}
      {confirmDialog}
    </div>
  );
}
