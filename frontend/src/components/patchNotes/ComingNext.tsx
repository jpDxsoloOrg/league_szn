import { useTranslation } from 'react-i18next';
import { Rocket } from 'lucide-react';
import Skeleton from '../ui/Skeleton';
import PatchNotesMarkdown from './PatchNotesMarkdown';
import { usePatchNotesMarkdown, type PatchNotesLocale } from './patchNotesData';

interface ComingNextProps {
  file: string;
  locale: PatchNotesLocale;
}

/** Preview of what is being built next. Hidden if its file cannot be loaded. */
export default function ComingNext({ file, locale }: ComingNextProps) {
  const { t } = useTranslation();
  const { markdown, loading, failed } = usePatchNotesMarkdown(file, locale);

  if (failed) return null;

  return (
    <section className="patch-notes-next" aria-labelledby="patch-notes-next-heading">
      <p className="patch-notes-next__flag">
        <Rocket aria-hidden="true" size={16} />
        {t('patchNotes.comingNextFlag')}
      </p>
      <h2 id="patch-notes-next-heading" className="patch-notes-next__heading">
        {t('patchNotes.comingNext')}
      </h2>
      {loading && <Skeleton variant="block" count={2} />}
      {markdown && <PatchNotesMarkdown content={markdown.content} />}
    </section>
  );
}
