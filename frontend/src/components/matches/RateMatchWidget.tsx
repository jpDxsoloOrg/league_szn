import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { matchesApi } from '../../services/api/matches.api';
import { StarRating } from './StarRating';
import './RateMatchWidget.css';

export interface RateMatchWidgetProps {
  matchId: string;
  matchStatus: 'scheduled' | 'completed' | string;
  userHasRated: boolean;
  userRating: number | null;
  /** Optional callback invoked after a successful rating submission. */
  onRated?: (newRating: number) => void;
}

const STAR_POSITIONS = [1, 2, 3, 4, 5] as const;
const ALREADY_RATED_MARKER = 'already rated';
const STAR_GLYPH = '★'; // ★

type FillState = 'full' | 'half' | 'empty';

/**
 * Belt-and-braces UX cache. The server is the source of truth for who rated
 * what, but a transient enrichment failure on getEvent must NOT make a
 * user's own browser forget they already rated. Keyed by the user's email
 * so a different account on the same browser can't be tricked into seeing
 * a locked widget for a match they didn't actually rate.
 *
 * Lifecycle: written on successful submit, read on render. The server
 * response wins when it's available (userHasRated=true bypasses cache
 * inspection). Ratings are immutable so cached entries never go stale.
 */
const RATED_CACHE_PREFIX = 'lszn:rated';

function ratedCacheKey(userEmail: string | null, matchId: string): string | null {
  if (!userEmail) return null;
  return `${RATED_CACHE_PREFIX}:${userEmail}:${matchId}`;
}

function readCachedRating(userEmail: string | null, matchId: string): number | null {
  const key = ratedCacheKey(userEmail, matchId);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedRating(userEmail: string | null, matchId: string, rating: number): void {
  const key = ratedCacheKey(userEmail, matchId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, String(rating));
  } catch {
    /* private mode / storage full — best effort */
  }
}

function fillFor(value: number, star: number): FillState {
  if (value >= star) return 'full';
  if (value >= star - 0.5) return 'half';
  return 'empty';
}

/**
 * Interactive half-star rating picker for a completed match (RIV-28).
 *
 * Renders a strip of five stars where each star is split into two
 * hit-targets (left = half, right = full). Hovering previews the
 * value visually; clicking commits via matchesApi.submitRating.
 *
 * After a successful submit (or when the server tells us the user
 * has already rated), the widget transitions to a read-only display
 * showing the user's rating. The widget renders nothing for matches
 * that are not yet completed, and a sign-in prompt for guests.
 */
export const RateMatchWidget = ({
  matchId,
  matchStatus,
  userHasRated,
  userRating,
  onRated,
}: RateMatchWidgetProps) => {
  const { t } = useTranslation();
  const { isAuthenticated, email } = useAuth();
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRating, setSubmittedRating] = useState<number | null>(null);

  // Only show on completed matches.
  if (matchStatus !== 'completed') return null;

  // Guests: prompt to sign in.
  if (!isAuthenticated) {
    return (
      <div className="rate-match-widget rate-match-widget--guest">
        <span className="rate-match-widget__label">
          {t('match.rating.signInToRate', 'Sign in to rate this match')}
        </span>
      </div>
    );
  }

  // Already rated. Three sources, in priority order:
  //  1) the server's userHasRated=true (most trustworthy)
  //  2) a just-submitted rating from this React session
  //  3) a localStorage trace from a prior submit on this browser (defensive
  //     UX so a server-side enrichment hiccup doesn't show the picker again)
  const cachedRating = readCachedRating(email, matchId);
  const effectiveUserRating = submittedRating ?? userRating ?? cachedRating;
  const isLocked = userHasRated || submittedRating != null || cachedRating != null;
  if (isLocked) {
    return (
      <div className="rate-match-widget rate-match-widget--rated">
        <span className="rate-match-widget__label">
          {t('match.rating.youRated', {
            rating: effectiveUserRating ?? 0,
            defaultValue: 'You rated this {{rating}}',
          })}
        </span>
        <StarRating
          starRating={effectiveUserRating ?? 0}
          ratingsCount={1}
          showCount={false}
          size="sm"
        />
        {submittedRating != null && (
          <span className="rate-match-widget__thanks">
            {t('match.rating.thanksForRating', 'Thanks for rating!')}
          </span>
        )}
      </div>
    );
  }

  const previewValue = hoverValue ?? 0;

  const handleClick = async (value: number) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await matchesApi.submitRating(matchId, value);
      setSubmittedRating(value);
      writeCachedRating(email, matchId, value);
      onRated?.(value);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes(ALREADY_RATED_MARKER)) {
        // Server says we already rated; lock the widget. We don't know
        // the exact prior value if userRating is null, so fall back to
        // whatever the parent already passed in.
        const lockedValue = userRating ?? value;
        setSubmittedRating(lockedValue);
        writeCachedRating(email, matchId, lockedValue);
      } else {
        setError(
          t('match.rating.submitError', 'Could not submit rating. Try again.')
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rate-match-widget"
      aria-label={t('match.rating.rateThisMatch', 'Rate this match')}
    >
      <span className="rate-match-widget__label">
        {t('match.rating.rateThisMatch', 'Rate this match')}
      </span>
      <div
        className="rate-match-widget__stars"
        role="radiogroup"
        onMouseLeave={() => setHoverValue(null)}
      >
        {STAR_POSITIONS.map(star => {
          const halfValue = star - 0.5;
          const fullValue = star;
          const halfLabel = t('match.rating.giveStars', {
            value: halfValue,
            defaultValue: '{{value}} stars',
          });
          const fullLabel = t('match.rating.giveStars', {
            value: fullValue,
            defaultValue: '{{value}} stars',
          });
          const fillState = fillFor(previewValue, star);
          return (
            <span
              key={star}
              className={`rate-match-widget__star rate-match-widget__star--${fillState}`}
            >
              {/* Same DOM as the read-only <StarRating> display in the
                  match awards header — two ★ glyph layers, the gold fg
                  clipped by width per fill state. Whatever browser
                  renders one will render the other identically. */}
              <span className="rate-match-widget__star-bg" aria-hidden="true">
                {STAR_GLYPH}
              </span>
              <span className="rate-match-widget__star-fg" aria-hidden="true">
                {STAR_GLYPH}
              </span>
              <button
                type="button"
                role="radio"
                aria-checked={false}
                aria-label={halfLabel}
                disabled={submitting}
                className="rate-match-widget__half rate-match-widget__half--left"
                onMouseEnter={() => setHoverValue(halfValue)}
                onFocus={() => setHoverValue(halfValue)}
                onClick={() => handleClick(halfValue)}
              />
              <button
                type="button"
                role="radio"
                aria-checked={false}
                aria-label={fullLabel}
                disabled={submitting}
                className="rate-match-widget__half rate-match-widget__half--right"
                onMouseEnter={() => setHoverValue(fullValue)}
                onFocus={() => setHoverValue(fullValue)}
                onClick={() => handleClick(fullValue)}
              />
            </span>
          );
        })}
      </div>
      {error && (
        <span className="rate-match-widget__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default RateMatchWidget;
