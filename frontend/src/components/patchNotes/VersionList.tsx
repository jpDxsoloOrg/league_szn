import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  formatReleaseDate,
  releasePath,
  releaseSummary,
  releaseTitle,
  type PatchNotesLocale,
  type PatchNotesRelease,
} from './patchNotesData';
import { versionSlug } from './versions';

interface VersionListProps {
  releases: PatchNotesRelease[];
  currentVersion: string;
  locale: PatchNotesLocale;
}

/** Every release, newest first, with the open one marked. */
export default function VersionList({ releases, currentVersion, locale }: VersionListProps) {
  const { t } = useTranslation();

  return (
    <>
      <h2 id="patch-notes-versions-heading" className="patch-notes-versions__heading">
        {t('patchNotes.versions')}
      </h2>
      <ol className="patch-notes-versions__list">
        {releases.map((release) => {
          const isCurrent = release.version === currentVersion;
          return (
            <li key={release.version}>
              <Link
                to={releasePath(release)}
                className={`patch-notes-versions__item${isCurrent ? ' patch-notes-versions__item--current' : ''}`}
                aria-current={isCurrent ? 'page' : undefined}
              >
                <span className="patch-notes-versions__meta">
                  <span className="patch-notes-versions__version">{versionSlug(release.version)}</span>
                  <time dateTime={release.date}>{formatReleaseDate(release.date, locale)}</time>
                </span>
                <span className="patch-notes-versions__title">{releaseTitle(release, locale)}</span>
                <span className="patch-notes-versions__summary">{releaseSummary(release, locale)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
