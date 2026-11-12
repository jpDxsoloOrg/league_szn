import { useTranslation } from 'react-i18next';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import PatchNotesMarkdown from './PatchNotesMarkdown';
import {
  formatReleaseDate,
  releaseTitle,
  usePatchNotesMarkdown,
  type PatchNotesLocale,
  type PatchNotesRelease,
} from './patchNotesData';
import { versionSlug } from './versions';

interface ReleasePostProps {
  release: PatchNotesRelease;
  isLatest: boolean;
  locale: PatchNotesLocale;
}

/** One release: version badge, date, title and the markdown post. */
export default function ReleasePost({ release, isLatest, locale }: ReleasePostProps) {
  const { t } = useTranslation();
  const { markdown, loading, failed } = usePatchNotesMarkdown(release.file, locale);

  return (
    <article className="patch-notes-release" aria-labelledby="patch-notes-release-title">
      <header className="patch-notes-release__header">
        <p className="patch-notes-release__meta">
          <span className="patch-notes-release__version">{versionSlug(release.version)}</span>
          {isLatest && <Badge tone="pink">{t('patchNotes.latest')}</Badge>}
          <time dateTime={release.date}>{formatReleaseDate(release.date, locale)}</time>
        </p>
        <h2 id="patch-notes-release-title" className="patch-notes-release__title">
          {releaseTitle(release, locale)}
        </h2>
      </header>

      {loading && <Skeleton variant="block" count={3} />}
      {!loading && failed && <EmptyState title={t('patchNotes.postFailed')} />}
      {markdown && (
        <>
          {markdown.fromFallback && (
            <p className="wiki-fallback-notice" role="status">
              {t('patchNotes.showingEnglishFallback')}
            </p>
          )}
          <PatchNotesMarkdown content={markdown.content} />
        </>
      )}
    </article>
  );
}
