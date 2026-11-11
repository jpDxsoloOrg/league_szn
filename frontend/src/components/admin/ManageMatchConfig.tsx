import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { matchTypesApi, stipulationsApi } from '../../services/api';
import type { MatchType, Stipulation } from '../../types';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Tabs from '../ui/Tabs';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

interface ConfigInput {
  name: string;
  description?: string;
}

interface ConfigItem extends ConfigInput {
  id: string;
}

interface ConfigLabels {
  section: string;
  create: string;
  edit: string;
  update: string;
  name: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  emptyTitle: string;
  emptyText: string;
  created: string;
  updated: string;
  deleted: string;
  deletePrompt: (name: string) => string;
  loadFailed: string;
  saveFailed: string;
  deleteFailed: string;
}

interface ConfigListProps {
  idPrefix: string;
  labels: ConfigLabels;
  load: () => Promise<ConfigItem[]>;
  create: (input: ConfigInput) => Promise<unknown>;
  update: (id: string, input: ConfigInput) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

const EMPTY_FORM = { name: '', description: '' };

/** One editable list. Match types and stipulations have the same shape. */
function ConfigList({ idPrefix, labels, load, create, update, remove }: ConfigListProps) {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ConfigItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const refresh = useCallback(async () => {
    try {
      setItems(await load());
    } catch {
      setError(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [load, labels.loadFailed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const openEdit = (item: ConfigItem) => {
    setEditing(item);
    setFormData({ name: item.name, description: item.description ?? '' });
    setShowForm(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFormError(null);
    setSaving(true);
    const input = { name: formData.name, description: formData.description || undefined };
    try {
      if (editing) {
        await update(editing.id, input);
        setSuccess(labels.updated);
      } else {
        await create(input);
        setSuccess(labels.created);
      }
      closeForm();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : labels.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ConfigItem) => {
    const confirmed = await confirm({ title: labels.deletePrompt(item.name), confirmLabel: t('common.delete', 'Delete') });
    if (!confirmed) return;

    setDeleting(item.id);
    setError(null);
    setSuccess(null);
    try {
      await remove(item.id);
      setSuccess(labels.deleted);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.deleteFailed);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="ac-section">
      <div className="ac-toolbar">
        <span className="ac-toolbar__count">{items.length} {labels.section}</span>
        <span className="ac-toolbar__spacer" />
        <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowForm(true)}>
          {labels.create}
        </Button>
      </div>

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <DataTable
        caption={labels.section}
        density="dense"
        loading={loading}
        rows={items}
        rowKey={(item) => item.id}
        empty={(
          <EmptyState
            icon={<SlidersHorizontal aria-hidden="true" size={32} />}
            title={labels.emptyTitle}
            description={labels.emptyText}
          />
        )}
        columns={[
          {
            key: 'name',
            header: labels.name,
            render: (item) => <span className="ac-cell__title">{item.name}</span>,
            sortValue: (item) => item.name,
          },
          {
            key: 'description',
            header: t('adminContent.description', 'Description'),
            render: (item) => item.description || '—',
          },
          {
            key: 'actions',
            header: t('common.actions', 'Actions'),
            align: 'end',
            render: (item) => (
              <div className="ac-actions ac-actions--end">
                <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>{t('common.edit', 'Edit')}</Button>
                <Button variant="ghost" size="sm" loading={deleting === item.id} onClick={() => handleDelete(item)}>
                  {t('common.delete', 'Delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <AdminFormModal
        open={showForm}
        onClose={closeForm}
        title={editing ? labels.edit : labels.create}
        submitLabel={editing ? labels.update : labels.create}
        onSubmit={handleSubmit}
        busy={saving}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor={`${idPrefix}-name`}>{labels.name}</label>
          <input
            type="text"
            id={`${idPrefix}-name`}
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder={labels.namePlaceholder}
            required
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor={`${idPrefix}-description`}>
            {t('adminContent.descriptionOptional', 'Description (Optional)')}
          </label>
          <textarea
            id={`${idPrefix}-description`}
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            placeholder={labels.descriptionPlaceholder}
            rows={3}
          />
        </div>
      </AdminFormModal>

      {confirmDialog}
    </section>
  );
}

async function loadMatchTypes(): Promise<ConfigItem[]> {
  const matchTypes: MatchType[] = await matchTypesApi.getAll();
  return matchTypes.map((matchType) => ({ ...matchType, id: matchType.matchTypeId }));
}

async function loadStipulations(): Promise<ConfigItem[]> {
  const stipulations: Stipulation[] = await stipulationsApi.getAll();
  return stipulations.map((stipulation) => ({ ...stipulation, id: stipulation.stipulationId }));
}

export default function ManageMatchConfig() {
  const { t } = useTranslation();

  const matchTypeLabels: ConfigLabels = {
    section: t('adminContent.matchConfig.matchTypes', 'Match Types'),
    create: t('adminContent.matchConfig.createMatchType', 'Create Match Type'),
    edit: t('adminContent.matchConfig.editMatchType', 'Edit Match Type'),
    update: t('adminContent.matchConfig.updateMatchType', 'Update Match Type'),
    name: t('adminContent.matchConfig.matchTypeName', 'Match Type Name'),
    namePlaceholder: t('adminContent.matchConfig.matchTypePlaceholder', 'e.g., Singles, Tag Team, Triple Threat, Fatal 4-Way'),
    descriptionPlaceholder: t('adminContent.matchConfig.matchTypeDescription', 'Brief description of this match type'),
    emptyTitle: t('adminContent.matchConfig.noMatchTypes', 'No match types yet'),
    emptyText: t('adminContent.matchConfig.noMatchTypesText', 'Create your first match type.'),
    created: t('adminContent.matchConfig.matchTypeCreated', 'Match type created successfully!'),
    updated: t('adminContent.matchConfig.matchTypeUpdated', 'Match type updated successfully!'),
    deleted: t('adminContent.matchConfig.matchTypeDeleted', 'Match type deleted successfully!'),
    deletePrompt: (name) => t('adminContent.deletePrompt', 'Delete {{name}}?', { name }),
    loadFailed: t('adminContent.matchConfig.matchTypesLoadFailed', 'Failed to load match types'),
    saveFailed: t('adminContent.matchConfig.matchTypeSaveFailed', 'Failed to save match type'),
    deleteFailed: t('adminContent.matchConfig.matchTypeDeleteFailed', 'Failed to delete match type'),
  };

  const stipulationLabels: ConfigLabels = {
    section: t('adminContent.matchConfig.stipulations', 'Stipulations'),
    create: t('adminContent.matchConfig.createStipulation', 'Create Stipulation'),
    edit: t('adminContent.matchConfig.editStipulation', 'Edit Stipulation'),
    update: t('adminContent.matchConfig.updateStipulation', 'Update Stipulation'),
    name: t('adminContent.matchConfig.stipulationName', 'Stipulation Name'),
    namePlaceholder: t('adminContent.matchConfig.stipulationPlaceholder', 'e.g., Ladder Match, Steel Cage, Hell in a Cell'),
    descriptionPlaceholder: t('adminContent.matchConfig.stipulationDescription', 'Brief description of this stipulation'),
    emptyTitle: t('adminContent.matchConfig.noStipulations', 'No stipulations yet'),
    emptyText: t('adminContent.matchConfig.noStipulationsText', 'Create your first stipulation.'),
    created: t('adminContent.matchConfig.stipulationCreated', 'Stipulation created successfully!'),
    updated: t('adminContent.matchConfig.stipulationUpdated', 'Stipulation updated successfully!'),
    deleted: t('adminContent.matchConfig.stipulationDeleted', 'Stipulation deleted successfully!'),
    deletePrompt: (name) => t('adminContent.deletePrompt', 'Delete {{name}}?', { name }),
    loadFailed: t('adminContent.matchConfig.stipulationsLoadFailed', 'Failed to load stipulations'),
    saveFailed: t('adminContent.matchConfig.stipulationSaveFailed', 'Failed to save stipulation'),
    deleteFailed: t('adminContent.matchConfig.stipulationDeleteFailed', 'Failed to delete stipulation'),
  };

  const tabs: { value: string; label: string; content: ReactNode }[] = [
    {
      value: 'matchTypes',
      label: matchTypeLabels.section,
      content: (
        <ConfigList
          idPrefix="match-type"
          labels={matchTypeLabels}
          load={loadMatchTypes}
          create={matchTypesApi.create}
          update={matchTypesApi.update}
          remove={matchTypesApi.delete}
        />
      ),
    },
    {
      value: 'stipulations',
      label: stipulationLabels.section,
      content: (
        <ConfigList
          idPrefix="stipulation"
          labels={stipulationLabels}
          load={loadStipulations}
          create={stipulationsApi.create}
          update={stipulationsApi.update}
          remove={stipulationsApi.delete}
        />
      ),
    },
  ];

  return (
    <div className="ac-page">
      <PageHeader title={t('adminContent.matchConfig.title', 'Match Config')} />
      <Tabs label={t('adminContent.matchConfig.title', 'Match Config')} items={tabs} />
    </div>
  );
}
