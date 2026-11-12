import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { adminApi } from '../../services/api';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';
import './ClearAllData.css';

const CONFIRMATION_PHRASE = 'DELETE ALL DATA';

const SEED_MODULES: { id: string; label: string }[] = [
  { id: 'core', label: 'Core (Divisions, Players, Seasons)' },
  { id: 'championships', label: 'Championships' },
  { id: 'matches', label: 'Matches' },
  { id: 'standings', label: 'Standings' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'events', label: 'Events' },
  { id: 'contenders', label: 'Contenders' },
  { id: 'config', label: 'Config (Site, Stipulations, Match Types)' },
  { id: 'rivalries', label: 'Rivalries (with sample promos, messages, notes)' },
  { id: 'matchRatings', label: 'Match Ratings (with rivalry heat scores)' },
];

const SEED_DETAILS: { key: string; title: string; text: string }[] = [
  { key: 'players', title: '12 Players', text: 'With random win/loss records and wrestler assignments' },
  { key: 'divisions', title: '3 Divisions', text: 'e.g., Heavyweight, Cruiserweight, Mid-Card' },
  { key: 'season', title: '1 Active Season', text: 'With standings for all players' },
  { key: 'championships', title: '4 Championships', text: 'World, Intercontinental, Tag Team, and US titles' },
  { key: 'matches', title: '12 Matches', text: 'Mix of completed and scheduled matches' },
  { key: 'tournaments', title: '2 Tournaments', text: 'Single elimination and round robin' },
  { key: 'rivalries', title: '3 Rivalries', text: 'Sample storylines across heat tiers, with linked promos, messages and notes' },
  { key: 'ratings', title: 'Match Ratings', text: 'Star ratings on completed matches with rivalry heat scores recomputed from them' },
];

const DELETED_ITEMS: { key: string; label: string }[] = [
  { key: 'players', label: 'All players (wrestlers) and their records' },
  { key: 'matches', label: 'All matches and results' },
  { key: 'championships', label: 'All championships and their history' },
  { key: 'tournaments', label: 'All tournaments' },
  { key: 'seasons', label: 'All seasons and standings' },
  { key: 'divisions', label: 'All divisions' },
  { key: 'rivalries', label: 'All rivalries (including their promos, messages, notes, and heat)' },
  { key: 'ratings', label: 'All match ratings submitted by users' },
];

const RESULT_ROWS: { key: string; label: string }[] = [
  { key: 'players', label: 'Players' },
  { key: 'tagTeams', label: 'Tag Teams' },
  { key: 'matches', label: 'Matches' },
  { key: 'championships', label: 'Championships' },
  { key: 'championshipHistory', label: 'Championship History' },
  { key: 'tournaments', label: 'Tournaments' },
  { key: 'seasons', label: 'Seasons' },
  { key: 'seasonStandings', label: 'Season Standings' },
  { key: 'divisions', label: 'Divisions' },
  { key: 'rivalries', label: 'Rivalries' },
  { key: 'rivalryMessages', label: 'Rivalry Messages' },
  { key: 'rivalryNotes', label: 'Rivalry Notes' },
  { key: 'matchRatings', label: 'Match Ratings' },
];

export default function ClearAllData() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [clearLoading, setClearLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resultCounts, setResultCounts] = useState<Record<string, number> | null>(null);
  const [errorCounts, setErrorCounts] = useState<Record<string, number> | null>(null);
  const [resultType, setResultType] = useState<'deleted' | 'created' | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [selectedSeedModules, setSelectedSeedModules] = useState<string[]>([]);

  const toggleSeedModule = (moduleId: string) => {
    setSelectedSeedModules((previous) => (
      previous.includes(moduleId) ? previous.filter((item) => item !== moduleId) : [...previous, moduleId]
    ));
  };

  const handleClearAll = async () => {
    if (confirmText !== CONFIRMATION_PHRASE) return;

    const confirmed = await confirm({
      title: t('adminContent.danger.finalWarning', 'Final warning'),
      description: t(
        'adminContent.danger.finalWarningText',
        'This permanently deletes all league data, including players, matches, championships, tournaments, seasons, divisions, and standings. There is no undo.',
      ),
      confirmLabel: t('adminContent.danger.clearAll', 'Clear All Data'),
    });
    if (!confirmed) return;

    setClearLoading(true);
    setError(null);
    setSuccess(null);
    setResultCounts(null);

    try {
      const result = await adminApi.clearAll();
      // A partial success lists the tables that did not fully drain.
      const failedCounts = (result as { errorCounts?: Record<string, number> }).errorCounts ?? null;
      setSuccess(result.message ?? t('adminContent.danger.cleared', 'All data has been cleared successfully!'));
      setResultCounts(result.deletedCounts);
      setErrorCounts(failedCounts);
      setResultType('deleted');
      setConfirmText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.danger.clearFailed', 'Failed to clear data'));
      setErrorCounts(null);
    } finally {
      setClearLoading(false);
    }
  };

  const handleSeedData = async () => {
    const confirmed = await confirm({
      title: t('adminContent.danger.seedTitle', 'Generate Sample Data'),
      description: t(
        'adminContent.danger.seedConfirm',
        'This will generate sample data including players, divisions, seasons, championships, matches, and tournaments. Any existing data will remain.',
      ),
      confirmLabel: t('adminContent.danger.seedConfirmLabel', 'Generate'),
      danger: false,
    });
    if (!confirmed) return;

    setSeedLoading(true);
    setError(null);
    setSuccess(null);
    setResultCounts(null);

    try {
      const result = selectedSeedModules.length > 0
        ? await adminApi.seedData({ modules: selectedSeedModules })
        : await adminApi.seedData();
      setSuccess(t('adminContent.danger.seeded', 'Sample data has been generated successfully!'));
      setResultCounts(result.createdCounts);
      setErrorCounts(null);
      setResultType('created');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.danger.seedFailed', 'Failed to seed data'));
      setErrorCounts(null);
    } finally {
      setSeedLoading(false);
    }
  };

  const isLoading = clearLoading || seedLoading;

  return (
    <div className="ac-page">
      <PageHeader title={t('adminContent.danger.title', 'Danger Zone')} />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      {resultCounts && (
        <section className="ac-section">
          <h2 className="ac-section__title">
            {resultType === 'deleted'
              ? t('adminContent.danger.deletedItems', 'Deleted Items:')
              : t('adminContent.danger.createdItems', 'Created Items:')}
          </h2>
          <ul className="data-results">
            {RESULT_ROWS.map((row) => (
              <li key={row.key}>
                {t(`adminContent.danger.counts.${row.key}`, row.label)}: {resultCounts[row.key] ?? 0}
              </li>
            ))}
          </ul>
          {errorCounts && Object.keys(errorCounts).length > 0 && (
            <>
              <h3 className="ac-section__title">{t('adminContent.danger.errorsTitle', 'Errors (some rows could not be processed):')}</h3>
              <ul className="data-results">
                {Object.entries(errorCounts).map(([key, count]) => (
                  <li key={key}>{key}: {count}</li>
                ))}
              </ul>
              <p className="ac-field__hint">
                {t(
                  'adminContent.danger.errorsHint',
                  'Check the backend logs for the underlying cause. Common reasons: a table missing in this environment, a schema mismatch, or an IAM permission denial.',
                )}
              </p>
            </>
          )}
        </section>
      )}

      <Card className="ac-section">
        <h2 className="ac-section__title">{t('adminContent.danger.seedTitle', 'Generate Sample Data')}</h2>
        <p className="ac-section__text">
          {t('adminContent.danger.seedText', 'Quickly populate the league with sample data for testing or demonstration purposes.')}
        </p>

        <fieldset className="data-modules">
          <legend className="ac-field__label">{t('adminContent.danger.seedOptions', 'Seed options (optional)')}</legend>
          <p className="ac-field__hint">
            {t('adminContent.danger.seedOptionsHint', 'No selection = seed everything. Dependencies are added automatically when needed.')}
          </p>
          <div className="ac-actions">
            <Button variant="ghost" size="sm" onClick={() => setSelectedSeedModules(SEED_MODULES.map((module) => module.id))}>
              {t('adminContent.danger.selectAll', 'Select all')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedSeedModules([])}>
              {t('adminContent.danger.selectNone', 'Select none')}
            </Button>
          </div>
          <div className="data-modules__grid">
            {SEED_MODULES.map((module) => (
              <label key={module.id} className="ac-check">
                <input
                  type="checkbox"
                  checked={selectedSeedModules.includes(module.id)}
                  onChange={() => toggleSeedModule(module.id)}
                  disabled={isLoading}
                />
                {t(`adminContent.danger.modules.${module.id}`, module.label)}
              </label>
            ))}
          </div>
        </fieldset>

        <details className="data-details">
          <summary>{t('adminContent.danger.seedDetails', 'What gets created (full seed)')}</summary>
          <ul>
            {SEED_DETAILS.map((item) => (
              <li key={item.key}>
                <strong>{t(`adminContent.danger.details.${item.key}.title`, item.title)}</strong>
                {' - '}
                {t(`adminContent.danger.details.${item.key}.text`, item.text)}
              </li>
            ))}
          </ul>
        </details>

        <div className="ac-actions">
          <Button onClick={handleSeedData} disabled={clearLoading} loading={seedLoading}>
            {t('adminContent.danger.seedTitle', 'Generate Sample Data')}
          </Button>
        </div>
      </Card>

      <Card className="ac-section data-danger">
        <h2 className="ac-section__title data-danger__title">
          <TriangleAlert aria-hidden="true" size={20} />
          {t('adminContent.danger.clearTitle', 'Danger Zone - Clear All Data')}
        </h2>
        <p className="ac-section__text">
          {t('adminContent.danger.clearIntro', 'This action will permanently delete all data from the system:')}
        </p>
        <ul className="data-danger__list">
          {DELETED_ITEMS.map((item) => (
            <li key={item.key}>{t(`adminContent.danger.deleted.${item.key}`, item.label)}</li>
          ))}
        </ul>
        <p className="ac-section__text">
          <strong>
            {t('adminContent.danger.clearWarning', 'This action CANNOT be undone. Make sure you have exported any data you want to keep before proceeding.')}
          </strong>
        </p>

        <div className="ac-field">
          <label className="ac-field__label" htmlFor="confirm-input">
            {t('adminContent.danger.typeToConfirm', {
              phrase: CONFIRMATION_PHRASE,
              defaultValue: `Type ${CONFIRMATION_PHRASE} to enable the delete button:`,
            })}
          </label>
          <input
            type="text"
            id="confirm-input"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={CONFIRMATION_PHRASE}
            disabled={isLoading}
            autoComplete="off"
          />
        </div>
        <div className="ac-actions">
          <Button
            variant="danger"
            onClick={handleClearAll}
            disabled={seedLoading || confirmText !== CONFIRMATION_PHRASE}
            loading={clearLoading}
          >
            {t('adminContent.danger.clearAll', 'Clear All Data')}
          </Button>
        </div>
      </Card>

      {confirmDialog}
    </div>
  );
}
