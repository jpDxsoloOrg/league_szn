import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { divisionsApi } from '../../services/api';
import type { Division } from '../../types';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import './adminRoster.css';

const FORM_ID = 'division-form';

export default function ManageDivisions() {
  const { t } = useTranslation();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Division | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    loadDivisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const loadDivisions = async () => {
    try {
      setLoading(true);
      const data = await divisionsApi.getAll();
      setDivisions(data);
    } catch (_err) {
      setError(t('adminRoster.divisions.loadError', 'Failed to load divisions'));
    } finally {
      setLoading(false);
    }
  };

  const closeForm = () => {
    setFormData({ name: '', description: '' });
    setFormError(null);
    setShowForm(false);
    setEditingDivision(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setError(null);
    setSuccess(null);

    try {
      if (editingDivision) {
        await divisionsApi.update(editingDivision.divisionId, {
          name: formData.name,
          description: formData.description || undefined,
        });
        setSuccess(t('adminRoster.divisions.updated', 'Division updated successfully!'));
      } else {
        await divisionsApi.create({
          name: formData.name,
          description: formData.description || undefined,
        });
        setSuccess(t('adminRoster.divisions.created', 'Division created successfully!'));
      }

      closeForm();
      await loadDivisions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('adminRoster.divisions.saveError', 'Failed to save division'));
    }
  };

  const handleEdit = (division: Division) => {
    setEditingDivision(division);
    setFormData({
      name: division.name,
      description: division.description || '',
    });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await divisionsApi.delete(pendingDelete.divisionId);
      setSuccess(t('adminRoster.divisions.deleted', 'Division deleted successfully!'));
      await loadDivisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.divisions.deleteError', 'Failed to delete division'));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const columns: DataTableColumn<Division>[] = [
    {
      key: 'name',
      header: t('adminRoster.divisions.nameColumn', 'Name'),
      render: (division) => <span className="ar-strong">{division.name}</span>,
      sortValue: (division) => division.name,
    },
    {
      key: 'description',
      header: t('adminRoster.divisions.descriptionColumn', 'Description'),
      render: (division) => division.description || '—',
    },
    {
      key: 'actions',
      header: t('common.actions', 'Actions'),
      align: 'end',
      render: (division) => (
        <div className="ar-row-actions">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(division)}>{t('common.edit', 'Edit')}</Button>
          <Button variant="ghost" size="sm" onClick={() => setPendingDelete(division)}>{t('common.delete', 'Delete')}</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="ar-page manage-divisions">
      <PageHeader
        title={t('adminRoster.divisions.title', 'Manage Divisions')}
        actions={(
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowForm(true)}>
            {t('adminRoster.divisions.create', 'Create Division')}
          </Button>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <h2 className="ar-section-title">
        {t('adminRoster.divisions.all', 'All Divisions')} ({divisions.length})
      </h2>
      <DataTable
        className="ar-table"
        caption={t('adminRoster.divisions.all', 'All Divisions')}
        density="dense"
        columns={columns}
        rows={divisions}
        rowKey={(division) => division.divisionId}
        loading={loading}
        empty={(
          <EmptyState
            title={t('adminRoster.divisions.emptyTitle', 'No divisions yet')}
            description={t('adminRoster.divisions.emptyBody', 'Create your first division to group players.')}
          />
        )}
      />

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingDivision
          ? t('adminRoster.divisions.editTitle', 'Edit Division')
          : t('adminRoster.divisions.createTitle', 'Create New Division')}
        footer={(
          <>
            <Button variant="ghost" onClick={closeForm}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" form={FORM_ID}>
              {editingDivision
                ? t('adminRoster.divisions.update', 'Update Division')
                : t('adminRoster.divisions.create', 'Create Division')}
            </Button>
          </>
        )}
      >
        <form id={FORM_ID} onSubmit={handleSubmit} className="ar-form">
          {formError && <AdminNotice tone="error">{formError}</AdminNotice>}
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="division-name">
              {t('adminRoster.divisions.nameLabel', 'Division Name')}
            </label>
            <input
              className="ar-input"
              type="text"
              id="division-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder={t('adminRoster.divisions.namePlaceholder', 'e.g., Heavyweight, Cruiserweight, Main Event')}
            />
          </div>
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="division-description">
              {t('adminRoster.divisions.descriptionLabel', 'Description (Optional)')}
            </label>
            <textarea
              className="ar-input"
              id="division-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('adminRoster.divisions.descriptionPlaceholder', 'Brief description of this division')}
              rows={3}
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('adminRoster.divisions.deleteTitle', 'Delete division')}
        message={t('adminRoster.divisions.deleteConfirm', 'Are you sure you want to delete this division?')}
        confirmLabel={t('common.delete', 'Delete')}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
