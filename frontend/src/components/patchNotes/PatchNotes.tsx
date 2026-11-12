import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import ComingNext from './ComingNext';
import ReleasePost from './ReleasePost';
import VersionList from './VersionList';
import {
  PATCH_NOTES_ROOT,
  findRelease,
  releasePath,
  releaseTitle,
  usePatchNotesIndex,
  type PatchNotesLocale,
} from './patchNotesData';
import { versionSlug } from './versions';
import '../Wiki.css';
import './PatchNotes.css';

/** Versioned release notes: /patch-notes opens the latest, /patch-notes/v1.1.0 a specific one. */
export default function PatchNotes() {
  const { version } = useParams<{ version: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale: PatchNotesLocale = i18n.language?.startsWith('de') ? 'de' : 'en';
  const { index, loading, failed } = usePatchNotesIndex();

  const header = <PageHeader title={t('patchNotes.title')} subtitle={t('patchNotes.subtitle')} />;

  if (loading) {
    return (
      <div className="patch-notes">
        {header}
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  const releases = index?.releases ?? [];
  const latest = releases[0];
  if (failed || !latest) {
    return (
      <div className="patch-notes">
        {header}
        <EmptyState
          icon={<ScrollText aria-hidden="true" size={32} />}
          title={t('patchNotes.loadFailed')}
          description={t('patchNotes.loadFailedHint')}
        />
      </div>
    );
  }

  const release = version ? findRelease(releases, version) : latest;
  if (!release) {
    return (
      <div className="patch-notes">
        {header}
        <EmptyState
          icon={<ScrollText aria-hidden="true" size={32} />}
          title={t('patchNotes.notFound.title')}
          description={t('patchNotes.notFound.description', { version })}
          actionLabel={t('patchNotes.notFound.action', { version: versionSlug(latest.version) })}
          onAction={() => navigate(PATCH_NOTES_ROOT)}
        />
      </div>
    );
  }

  const pickerOptions = releases.map((entry) => ({
    value: entry.version,
    label: `${versionSlug(entry.version)} · ${releaseTitle(entry, locale)}`,
  }));

  return (
    <div className="patch-notes">
      {header}
      <div className="patch-notes__picker">
        <Select
          id="patch-notes-version"
          label={t('patchNotes.pickerLabel')}
          value={release.version}
          options={pickerOptions}
          onValueChange={(next) => {
            const target = findRelease(releases, next);
            if (target) navigate(releasePath(target));
          }}
        />
      </div>
      <div className="patch-notes__layout">
        <div className="patch-notes__post">
          <ReleasePost release={release} isLatest={release.version === latest.version} locale={locale} />
        </div>
        <aside className="patch-notes__versions" aria-labelledby="patch-notes-versions-heading">
          <VersionList releases={releases} currentVersion={release.version} locale={locale} />
        </aside>
        {index?.next && (
          <div className="patch-notes__next">
            <ComingNext file={index.next.file} locale={locale} />
          </div>
        )}
      </div>
    </div>
  );
}
