import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Plus } from 'lucide-react';
import { companiesApi } from '../../services/api';
import type { Company } from '../../types';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

const EMPTY_FORM = { name: '', abbreviation: '', description: '' };

export default function ManageCompanies() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const loadCompanies = useCallback(async () => {
    try {
      setCompanies(await companiesApi.getAll());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const closeForm = () => {
    setFormData(EMPTY_FORM);
    setShowForm(false);
    setEditingCompany(null);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFormError(null);
    setSaving(true);

    const input = {
      name: formData.name,
      abbreviation: formData.abbreviation || undefined,
      description: formData.description || undefined,
    };

    try {
      if (editingCompany) {
        await companiesApi.update(editingCompany.companyId, input);
        setSuccess(t('adminContent.companies.updated', 'Company updated'));
      } else {
        await companiesApi.create(input);
        setSuccess(t('adminContent.companies.created', 'Company created'));
      }
      closeForm();
      await loadCompanies();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('adminContent.companies.saveFailed', 'Failed to save company'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      abbreviation: company.abbreviation || '',
      description: company.description || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (companyId: string) => {
    const confirmed = await confirm({ title: t('companies.confirmDelete'), confirmLabel: t('common.delete') });
    if (!confirmed) return;

    setDeleting(companyId);
    setError(null);
    setSuccess(null);
    try {
      await companiesApi.delete(companyId);
      setSuccess(t('adminContent.companies.deleted', 'Company deleted'));
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('companies.deleteBlocked'));
    } finally {
      setDeleting(null);
    }
  };

  const title = t('companies.title');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="ac-page">
      <PageHeader
        title={title}
        actions={(
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowForm(true)}>
            {t('companies.create')}
          </Button>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <DataTable
        caption={title}
        density="dense"
        rows={companies}
        rowKey={(company) => company.companyId}
        empty={(
          <EmptyState
            icon={<Building2 aria-hidden="true" size={32} />}
            title={t('companies.noCompanies')}
            description={t('companies.createFirst')}
          />
        )}
        columns={[
          {
            key: 'name',
            header: t('companies.name'),
            render: (company) => <span className="ac-cell__title">{company.name}</span>,
            sortValue: (company) => company.name,
          },
          { key: 'abbreviation', header: t('companies.abbreviation'), render: (company) => company.abbreviation || '—' },
          { key: 'description', header: t('companies.description'), render: (company) => company.description || '—' },
          {
            key: 'actions',
            header: t('common.actions'),
            align: 'end',
            render: (company) => (
              <div className="ac-actions ac-actions--end">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(company)}>{t('common.edit')}</Button>
                <Button variant="ghost" size="sm" loading={deleting === company.companyId} onClick={() => handleDelete(company.companyId)}>
                  {t('common.delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <AdminFormModal
        open={showForm}
        onClose={closeForm}
        title={editingCompany ? t('companies.edit') : t('companies.create')}
        submitLabel={editingCompany ? t('companies.update', 'Update Company') : t('companies.create')}
        onSubmit={handleSubmit}
        busy={saving}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="company-name">{t('companies.name')}</label>
          <input
            type="text"
            id="company-name"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            required
            placeholder={t('adminContent.companies.namePlaceholder', 'e.g., WWE, AEW, NJPW')}
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="company-abbreviation">{t('companies.abbreviation')}</label>
          <input
            type="text"
            id="company-abbreviation"
            value={formData.abbreviation}
            onChange={(event) => setFormData({ ...formData, abbreviation: event.target.value })}
            placeholder={t('adminContent.companies.abbreviationPlaceholder', 'e.g., WWE, AEW')}
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="company-description">{t('companies.description')}</label>
          <textarea
            id="company-description"
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            placeholder={t('adminContent.companies.descriptionPlaceholder', 'Brief description of this company')}
            rows={3}
          />
        </div>
      </AdminFormModal>

      {confirmDialog}
    </div>
  );
}
