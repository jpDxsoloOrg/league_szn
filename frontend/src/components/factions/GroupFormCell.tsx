import Badge from '../ui/Badge';
import FormDots from '../ui/FormDots';
import type { FormResult } from '../ui/FormDots';

/** Streaks shorter than this are noise in a table, so they are not called out. */
const MIN_STREAK_SHOWN = 3;

interface GroupFormCellProps {
  recentForm?: FormResult[];
  currentStreak?: { type: FormResult; count: number };
}

const STREAK_TONES = { W: 'win', L: 'loss', D: 'draw' } as const;

/** Recent form dots plus a streak badge once a streak is long enough. */
export default function GroupFormCell({ recentForm, currentStreak }: GroupFormCellProps) {
  const hasForm = Boolean(recentForm && recentForm.length > 0);
  const hasStreak = Boolean(currentStreak && currentStreak.count >= MIN_STREAK_SHOWN);
  if (!hasForm && !hasStreak) return <span className="group-muted">—</span>;

  return (
    <span className="group-form-cell">
      {recentForm && hasForm && <FormDots results={recentForm} />}
      {currentStreak && hasStreak && (
        <Badge tone={STREAK_TONES[currentStreak.type]}>
          {currentStreak.count}{currentStreak.type}
        </Badge>
      )}
    </span>
  );
}
