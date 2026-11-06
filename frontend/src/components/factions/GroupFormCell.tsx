import Badge from '../ui/Badge';
import FormDots from '../ui/FormDots';
import type { FormResult } from '../ui/FormDots';
import { normalizeStreak } from './factionFormat';

/** Streaks shorter than this are noise in a table, so they are not called out. */
const MIN_STREAK_SHOWN = 3;

/** The column promises the last five. */
const FORM_SHOWN = 5;

interface GroupFormCellProps {
  /** Newest first, as the API sends it. */
  recentForm?: FormResult[];
  currentStreak?: { type: FormResult; count: number } | string;
}

const STREAK_TONES = { W: 'win', L: 'loss', D: 'draw' } as const;

/** Recent form dots plus a streak badge once a streak is long enough. */
export default function GroupFormCell({ recentForm, currentStreak }: GroupFormCellProps) {
  const form = (recentForm ?? []).slice(0, FORM_SHOWN).reverse();
  const streak = normalizeStreak(currentStreak);
  const hasStreak = Boolean(streak && streak.count >= MIN_STREAK_SHOWN);
  if (form.length === 0 && !hasStreak) return <span className="group-muted">—</span>;

  return (
    <span className="group-form-cell">
      {form.length > 0 && <FormDots results={form} />}
      {streak && hasStreak && <Badge tone={STREAK_TONES[streak.type]}>{streak.count}{streak.type}</Badge>}
    </span>
  );
}
