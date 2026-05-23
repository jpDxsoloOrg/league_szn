import { useTranslation } from 'react-i18next';
import './StarRating.css';

export interface StarRatingProps {
  /** Average rating rounded to nearest 0.5 (0..5). From Match.starRating. */
  starRating?: number;
  /** Number of ratings submitted for the match. From Match.ratingsCount. */
  ratingsCount?: number;
  /** Whether to render the trailing "(N)" votes count. Defaults to true. */
  showCount?: boolean;
  /** Visual size token. Defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg';
}

const TOTAL_STARS = 5;

/**
 * Read-only star rating display.
 *
 * Renders a strip of five stars, with a CSS-based half-fill on the boundary
 * star when the rating ends in .5. If there are no ratings (or the rating is
 * missing), renders a muted "Not yet rated" placeholder instead.
 */
export const StarRating = ({
  starRating,
  ratingsCount = 0,
  showCount = true,
  size = 'md',
}: StarRatingProps) => {
  const { t } = useTranslation();

  if (!ratingsCount || starRating == null || starRating <= 0) {
    return (
      <span className={`star-rating star-rating--${size} star-rating--empty`}>
        {t('match.rating.notYetRated', 'Not yet rated')}
      </span>
    );
  }

  // Clamp to [0, 5] then derive fill state for each star slot.
  const clamped = Math.max(0, Math.min(TOTAL_STARS, starRating));
  const slots: ('full' | 'half' | 'empty')[] = [];
  for (let i = 1; i <= TOTAL_STARS; i++) {
    if (clamped >= i) {
      slots.push('full');
    } else if (clamped >= i - 0.5) {
      slots.push('half');
    } else {
      slots.push('empty');
    }
  }

  const ariaLabel = t('match.rating.outOfFive', '{{rating}} of 5', { rating: clamped });

  return (
    <span
      className={`star-rating star-rating--${size}`}
      title={ariaLabel}
    >
      <span className="star-rating__stars" role="img" aria-label={ariaLabel}>
        {slots.map((kind, idx) => (
          <span key={idx} className={`star-rating__star star-rating__star--${kind}`} aria-hidden="true">
            <span className="star-rating__star-bg">{'★'}</span>
            <span className="star-rating__star-fg">{'★'}</span>
          </span>
        ))}
      </span>
      {showCount && (
        <span
          className="star-rating__count"
          aria-label={t('match.rating.votesCount', {
            count: ratingsCount,
            defaultValue: ratingsCount === 1 ? '{{count}} vote' : '{{count}} votes',
          })}
        >
          ({ratingsCount})
        </span>
      )}
    </span>
  );
};

export default StarRating;
