import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playersApi, rivalriesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { Player } from '../../types';
import type { RivalryHeat, WrestlerVariant } from '../../types/rivalry';
import './RequestRivalry.css';

interface PlanDraft {
  content: string;
  scheduledFor: string;
}

const HEAT_OPTIONS: RivalryHeat[] = ['frozen', 'cold', 'warm', 'hot', 'scorching'];

const MIN_DESCRIPTION = 50;
const MAX_DESCRIPTION = 1500;
const MAX_PITCH = 3000;
const MIN_PITCH = 100;
const MAX_TITLE = 80;
const MAX_PLANS = 5;

interface WrestlerPick {
  playerId: string | null;
  query: string;
  variant: WrestlerVariant;
}

const EMPTY_PICK: WrestlerPick = { playerId: null, query: '', variant: 'primary' };

/**
 * Admin-only two-step rivalry form. The admin picks any two
 * wrestlers (they're free to include themselves but aren't required
 * to). The backend createRivalry auto-flips an admin-created rivalry
 * to active + records the GM as the booker, so this UI is the
 * one-and-done entry point.
 */
export default function RequestRivalry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdminOrModerator } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [players, setPlayers] = useState<Player[]>([]);
  const [picks, setPicks] = useState<[WrestlerPick, WrestlerPick]>([EMPTY_PICK, EMPTY_PICK]);
  const [title, setTitle] = useState('');
  const [heat, setHeat] = useState<RivalryHeat>('warm');
  const [description, setDescription] = useState('');
  const [pitch, setPitch] = useState('');
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planFailures, setPlanFailures] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    playersApi
      .getAll(controller.signal)
      .then((p) => mounted && setPlayers(p))
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const playerLookup = useMemo(
    () => new Map(players.map((p) => [p.playerId, p] as const)),
    [players],
  );

  function updatePick(idx: 0 | 1, partial: Partial<WrestlerPick>): void {
    setPicks((prev) => {
      const next: [WrestlerPick, WrestlerPick] = [prev[0], prev[1]];
      next[idx] = { ...next[idx], ...partial };
      return next;
    });
  }

  function selectPick(idx: 0 | 1, p: Player): void {
    setPicks((prev) => {
      const next: [WrestlerPick, WrestlerPick] = [prev[0], prev[1]];
      next[idx] = { playerId: p.playerId, query: '', variant: 'primary' };
      return next;
    });
  }

  function searchOptions(idx: 0 | 1): Player[] {
    const q = picks[idx].query.toLowerCase().trim();
    // Exclude only the OTHER pick (so the same wrestler can't appear on both
    // sides). The caller themselves is fair game — admin may be one of them.
    const otherId = picks[idx === 0 ? 1 : 0].playerId;
    return players
      .filter((p) => p.playerId !== otherId)
      .filter((p) =>
        !q
          ? true
          : (p.name?.toLowerCase().includes(q) || p.currentWrestler?.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }

  const picked = (idx: 0 | 1): Player | null =>
    picks[idx].playerId ? playerLookup.get(picks[idx].playerId!) ?? null : null;

  const step1Valid =
    !!picks[0].playerId &&
    !!picks[1].playerId &&
    picks[0].playerId !== picks[1].playerId &&
    title.trim().length > 0 &&
    title.trim().length <= MAX_TITLE &&
    description.length >= MIN_DESCRIPTION &&
    description.length <= MAX_DESCRIPTION;

  const step2Valid = pitch.length >= MIN_PITCH && pitch.length <= MAX_PITCH;

  async function submit() {
    if (!step1Valid || !step2Valid) return;
    const [p0, p1] = picks;
    if (!p0.playerId || !p1.playerId) return;
    setSubmitting(true);
    setError(null);
    setPlanFailures(0);
    try {
      const rivalry = await rivalriesApi.create({
        title: title.trim(),
        description: pitch.trim() || description.trim(),
        heat,
        requestedBy: p0.playerId,
        participants: [
          { playerId: p0.playerId, role: 'instigator', wrestlerVariant: p0.variant },
          { playerId: p1.playerId, role: 'rival', wrestlerVariant: p1.variant },
        ],
      });

      let failures = 0;
      for (const plan of plans) {
        const content = plan.content.trim();
        if (!content) continue;
        try {
          await rivalriesApi.notes.upsert(rivalry.rivalryId, {
            noteType: 'plan',
            content,
            visibility: 'participants',
            scheduledFor: plan.scheduledFor || undefined,
          });
        } catch {
          failures++;
        }
      }
      if (failures > 0) {
        setPlanFailures(failures);
        setTimeout(() => navigate(`/rivalries/${rivalry.rivalryId}`), 1500);
      } else {
        navigate(`/rivalries/${rivalry.rivalryId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Route is feature-flagged; gracefully fail closed if a wrestler
  // somehow lands here.
  if (!isAdminOrModerator) {
    return (
      <div className="request-rivalry">
        <header className="request-rivalry__header">
          <h1>{t('rivalries.request.heading')}</h1>
        </header>
        <p>{t('rivalries.request.adminOnly', {
          defaultValue: 'Only GMs can open a new rivalry.',
        })}</p>
        <Link to="/rivalries" className="request-rivalry__cancel">
          {t('rivalries.detail.backToHub')}
        </Link>
      </div>
    );
  }

  return (
    <div className="request-rivalry">
      <header className="request-rivalry__header">
        <h1>{t('rivalries.request.heading')}</h1>
        <ol className="request-rivalry__steps">
          <li className={step === 1 ? 'is-active' : 'is-complete'}>
            1. {t('rivalries.request.step1')}
          </li>
          <li className={step === 2 ? 'is-active' : ''}>
            2. {t('rivalries.request.step2')}
          </li>
        </ol>
      </header>

      {error && (
        <div className="request-rivalry__error">
          <strong>{t('rivalries.request.errorTitle')}:</strong> {error}
        </div>
      )}

      {step === 1 && (
        <form
          className="request-rivalry__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (step1Valid) setStep(2);
          }}
        >
          {[0, 1].map((i) => {
            const idx = i as 0 | 1;
            const pick = picks[idx];
            const chosen = picked(idx);
            return (
              <div key={idx} className="request-rivalry__pick">
                <label>
                  <span>
                    {idx === 0
                      ? t('rivalries.request.instigator', { defaultValue: 'Instigator' })
                      : t('rivalries.request.rival', { defaultValue: 'Rival' })}
                  </span>
                  <input
                    type="text"
                    placeholder={t('rivalries.request2.opponentPlaceholder')}
                    value={chosen ? chosen.currentWrestler : pick.query}
                    onChange={(e) =>
                      updatePick(idx, { playerId: null, query: e.target.value })
                    }
                  />
                  {!chosen && pick.query && (
                    <ul className="request-rivalry__autocomplete">
                      {searchOptions(idx).map((p) => (
                        <li key={p.playerId}>
                          <button
                            type="button"
                            onClick={() => selectPick(idx, p)}
                          >
                            <strong>{p.currentWrestler}</strong>
                            <span>{p.name}</span>
                            <span className="request-rivalry__record">
                              {p.wins}-{p.losses}-{p.draws}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </label>
                {chosen?.alternateWrestler && (
                  <fieldset className="request-rivalry__variant">
                    <legend>
                      {t('rivalries.request.whichWrestler', {
                        defaultValue: 'Which wrestler is in this rivalry?',
                      })}
                    </legend>
                    <label>
                      <input
                        type="radio"
                        name={`variant-${idx}`}
                        checked={pick.variant === 'primary'}
                        onChange={() => updatePick(idx, { variant: 'primary' })}
                      />
                      <span>{chosen.currentWrestler} (primary)</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`variant-${idx}`}
                        checked={pick.variant === 'alternate'}
                        onChange={() => updatePick(idx, { variant: 'alternate' })}
                      />
                      <span>{chosen.alternateWrestler} (alternate)</span>
                    </label>
                  </fieldset>
                )}
              </div>
            );
          })}

          <label>
            <span>{t('rivalries.request.titleField')}</span>
            <input
              type="text"
              maxLength={MAX_TITLE}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bloodline Civil War"
            />
            <span className="request-rivalry__count">
              {title.length}/{MAX_TITLE}
            </span>
          </label>

          <fieldset className="request-rivalry__heat">
            <legend>{t('rivalries.request.heatField')}</legend>
            {HEAT_OPTIONS.map((h) => (
              <label key={h}>
                <input
                  type="radio"
                  name="heat"
                  value={h}
                  checked={heat === h}
                  onChange={() => setHeat(h)}
                />
                <span>{t(`rivalries.hub.chips.${h}`)}</span>
              </label>
            ))}
          </fieldset>

          <label>
            <span>{t('rivalries.request.descriptionField')}</span>
            <textarea
              rows={5}
              maxLength={MAX_DESCRIPTION}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <span className="request-rivalry__count">
              {description.length}/{MAX_DESCRIPTION} (min {MIN_DESCRIPTION})
            </span>
          </label>

          <footer className="request-rivalry__actions">
            <Link to="/rivalries" className="request-rivalry__cancel">
              {t('rivalries.request.cancel')}
            </Link>
            <button type="submit" disabled={!step1Valid}>
              {t('rivalries.request.submit')}
            </button>
          </footer>
        </form>
      )}

      {step === 2 && (
        <form
          className="request-rivalry__form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label>
            <span>{t('rivalries.request2.storylinePitch')}</span>
            <textarea
              rows={8}
              maxLength={MAX_PITCH}
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
            />
            <span className="request-rivalry__count">
              {pitch.length}/{MAX_PITCH} (min {MIN_PITCH})
            </span>
          </label>

          <fieldset className="request-rivalry__plans">
            <legend>{t('rivalries.request2.proposedPlans')}</legend>
            {plans.map((p, i) => (
              <div key={i} className="request-rivalry__plan-row">
                <input
                  type="text"
                  placeholder={t('rivalries.request2.planPlaceholder')}
                  value={p.content}
                  onChange={(e) => {
                    const next = [...plans];
                    next[i] = { ...p, content: e.target.value };
                    setPlans(next);
                  }}
                />
                <input
                  type="date"
                  value={p.scheduledFor}
                  onChange={(e) => {
                    const next = [...plans];
                    next[i] = { ...p, scheduledFor: e.target.value };
                    setPlans(next);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setPlans(plans.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            {plans.length < MAX_PLANS && (
              <button
                type="button"
                className="request-rivalry__plan-add"
                onClick={() => setPlans([...plans, { content: '', scheduledFor: '' }])}
              >
                {t('rivalries.request2.addPlan')}
              </button>
            )}
          </fieldset>

          {planFailures > 0 && (
            <div className="request-rivalry__warn">
              Some plans failed to save — edit later in the rivalry detail.
            </div>
          )}

          <footer className="request-rivalry__actions">
            <button
              type="button"
              className="request-rivalry__back"
              onClick={() => setStep(1)}
            >
              {t('rivalries.request2.back')}
            </button>
            <button type="submit" disabled={!step2Valid || submitting}>
              {t('rivalries.request.submit')}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}
