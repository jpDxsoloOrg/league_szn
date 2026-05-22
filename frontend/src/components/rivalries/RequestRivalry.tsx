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

const HEAT_OPTIONS: RivalryHeat[] = ['cold', 'warm', 'hot'];

const MIN_DESCRIPTION = 50;
const MAX_DESCRIPTION = 1500;
const MAX_PITCH = 3000;
const MIN_PITCH = 100;
const MAX_TITLE = 80;
const MAX_PLANS = 5;

/**
 * Two-step "Pitch a Rivalry" form. Wraps `rivalriesApi.create` plus
 * optional sequential `notes.upsert` calls for proposed plan rows.
 * State lives in this component — no router-driven step transitions
 * because the form is small enough that internal state is cheaper.
 */
export default function RequestRivalry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playerId } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [players, setPlayers] = useState<Player[]>([]);
  const [opponentQuery, setOpponentQuery] = useState('');
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [heat, setHeat] = useState<RivalryHeat>('warm');
  const [description, setDescription] = useState('');
  const [pitch, setPitch] = useState('');
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planFailures, setPlanFailures] = useState(0);
  const [myVariant, setMyVariant] = useState<WrestlerVariant>('primary');
  const [opponentVariant, setOpponentVariant] = useState<WrestlerVariant>('primary');

  const selfPlayer = players.find((p) => p.playerId === playerId) ?? null;
  const opponentPlayer = players.find((p) => p.playerId === opponentId) ?? null;

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

  const opponentOptions = useMemo(() => {
    const q = opponentQuery.toLowerCase().trim();
    return players
      .filter((p) => p.playerId !== playerId)
      .filter((p) =>
        !q
          ? true
          : (p.name?.toLowerCase().includes(q) || p.currentWrestler?.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [players, opponentQuery, playerId]);

  const opponentName = (id: string | null) => {
    if (!id) return '';
    const p = players.find((q) => q.playerId === id);
    return p?.currentWrestler ?? p?.name ?? '';
  };

  const step1Valid =
    !!opponentId &&
    title.trim().length > 0 &&
    title.trim().length <= MAX_TITLE &&
    description.length >= MIN_DESCRIPTION &&
    description.length <= MAX_DESCRIPTION;

  const step2Valid = pitch.length >= MIN_PITCH && pitch.length <= MAX_PITCH;

  async function submit() {
    if (!step1Valid || !step2Valid || !opponentId || !playerId) return;
    setSubmitting(true);
    setError(null);
    setPlanFailures(0);
    try {
      const rivalry = await rivalriesApi.create({
        title: title.trim(),
        description: pitch.trim() || description.trim(),
        heat,
        requestedBy: playerId,
        participants: [
          { playerId, role: 'instigator', wrestlerVariant: myVariant },
          { playerId: opponentId, role: 'rival', wrestlerVariant: opponentVariant },
        ],
      });

      // Best-effort sequential plan creation; failures flagged, not rolled back.
      let failures = 0;
      for (const plan of plans) {
        const content = plan.content.trim();
        if (!content) continue;
        try {
          await rivalriesApi.notes.upsert(rivalry.rivalryId, {
            noteType: 'plan',
            content,
            visibility: 'admins',
            scheduledFor: plan.scheduledFor || undefined,
          });
        } catch {
          failures++;
        }
      }
      if (failures > 0) {
        setPlanFailures(failures);
        // Brief delay so the banner is visible before nav.
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
          <label>
            <span>{t('rivalries.request.rivalField')}</span>
            <input
              type="text"
              placeholder={t('rivalries.request2.opponentPlaceholder')}
              value={opponentId ? opponentName(opponentId) : opponentQuery}
              onChange={(e) => {
                setOpponentId(null);
                setOpponentQuery(e.target.value);
              }}
            />
            {!opponentId && opponentQuery && (
              <ul className="request-rivalry__autocomplete">
                {opponentOptions.map((p) => (
                  <li key={p.playerId}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpponentId(p.playerId);
                        setOpponentQuery('');
                        setOpponentVariant('primary');
                      }}
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

          {selfPlayer?.alternateWrestler && (
            <fieldset className="request-rivalry__heat">
              <legend>
                {t('rivalries.request.myWrestler', { defaultValue: 'Which wrestler are you using?' })}
              </legend>
              <label>
                <input
                  type="radio"
                  name="myVariant"
                  checked={myVariant === 'primary'}
                  onChange={() => setMyVariant('primary')}
                />
                <span>{selfPlayer.currentWrestler} (primary)</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="myVariant"
                  checked={myVariant === 'alternate'}
                  onChange={() => setMyVariant('alternate')}
                />
                <span>{selfPlayer.alternateWrestler} (alternate)</span>
              </label>
            </fieldset>
          )}

          {opponentPlayer?.alternateWrestler && (
            <fieldset className="request-rivalry__heat">
              <legend>
                {t('rivalries.request.opponentWrestler', {
                  defaultValue: "Which wrestler is your opponent using?",
                })}
              </legend>
              <label>
                <input
                  type="radio"
                  name="opponentVariant"
                  checked={opponentVariant === 'primary'}
                  onChange={() => setOpponentVariant('primary')}
                />
                <span>{opponentPlayer.currentWrestler} (primary)</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="opponentVariant"
                  checked={opponentVariant === 'alternate'}
                  onChange={() => setOpponentVariant('alternate')}
                />
                <span>{opponentPlayer.alternateWrestler} (alternate)</span>
              </label>
            </fieldset>
          )}

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
