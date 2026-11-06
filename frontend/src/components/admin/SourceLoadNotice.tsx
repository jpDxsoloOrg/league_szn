import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import AdminNotice from './AdminNotice';

const SOURCE_LABELS = {
  championships: 'Championships',
  companies: 'Companies',
  divisions: 'Divisions',
  events: 'Events',
  matches: 'Matches',
  matchTypes: 'Match formats',
  players: 'Players',
  seasons: 'Seasons',
  stipulations: 'Stipulations',
  tagTeams: 'Tag teams',
  tournaments: 'Tournaments',
  users: 'Users',
  wrestlers: 'Wrestlers',
} as const;

export type AdminSource = keyof typeof SOURCE_LABELS;

export interface SourceLoadNoticeProps {
  failed: readonly AdminSource[];
  onRetry: () => void;
  retrying?: boolean;
  /** What the failure blocks, when more than the named lists are affected. */
  detail?: string;
}

/** Names the reads that failed and offers a retry. Renders nothing when all loaded. */
export default function SourceLoadNotice({ failed, onRetry, retrying = false, detail }: SourceLoadNoticeProps) {
  const { t } = useTranslation();
  if (failed.length === 0) return null;

  const sources = failed
    .map((source) => t(`adminRoster.sources.${source}`, SOURCE_LABELS[source]))
    .join(', ');

  return (
    <AdminNotice
      tone="error"
      action={(
        <Button variant="secondary" size="sm" loading={retrying} onClick={onRetry}>
          {t('common.retry', 'Retry')}
        </Button>
      )}
    >
      {t('adminRoster.sources.failed', { defaultValue: "Couldn't load: {{sources}}.", sources })}
      {detail ? ` ${detail}` : ''}
    </AdminNotice>
  );
}
