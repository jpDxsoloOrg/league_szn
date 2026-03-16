import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../../services/api';
import type { Company } from '../../types';
import Skeleton from '../ui/Skeleton';
import './ManageCompanies.css';

export default function ManageCompanies() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    abbreviation: '',
    description: '',
  });

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const data = await companiesApi.getAll();
      setCompanies(data);
    } catch (_err) {
      setError('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (editingCompany) {
        await companiesApi.update(editingCompany.companyId, {
          name: formData.name,
          abbreviation: formData.abbreviation || undefined,
          description: formData.description || undefined,
        });
        setSuccess(t('companies.edit') + ' - OK');
      } else {
        await companiesApi.create({
          name: formData.name,
          abbreviation: formData.abbreviation || undefined,
          description: formData.description || undefined,
        });
        setSuccess(t('companies.create') + ' - OK');
      }

      setFormData({ name: '', abbreviation: '', description: '' });
      setShowAddForm(false);
      setEditingCompany(null);
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save company');
    }
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      abbreviation: company.abbreviation || '',
      description: company.description || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (companyId: string) => {
    if (!confirm(t('companies.confirmDelete'))) {
      return;
    }

    setDeleting(companyId);
    setError(null);
    setSuccess(null);

    try {
      await companiesApi.delete(companyId);
      setSuccess(t('companies.delete') + ' - OK');
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('companies.deleteBlocked'));
    } finally {
      setDeleting(null);
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', abbreviation: '', description: '' });
    setShowAddForm(false);
    setEditingCompany(null);
  };

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  return (
    <div className="manage-companies">
      <div className="companies-header">
        <h2>{t('companies.title')}</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}>
            {t('companies.create')}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="company-form-container">
          <h3>{editingCompany ? t('companies.edit') : t('companies.create')}</h3>
          <form onSubmit={handleSubmit} className="company-form">
            <div className="form-group">
              <label htmlFor="company-name">{t('companies.name')}</label>
              <input
                type="text"
                id="company-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., WWE, AEW, NJPW"
              />
            </div>

            <div className="form-group">
              <label htmlFor="company-abbreviation">{t('companies.abbreviation')}</label>
              <input
                type="text"
                id="company-abbreviation"
                value={formData.abbreviation}
                onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                placeholder="e.g., WWE, AEW"
              />
            </div>

            <div className="form-group">
              <label htmlFor="company-description">{t('companies.description')}</label>
              <textarea
                id="company-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this company"
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button type="submit">
                {editingCompany ? t('companies.edit') : t('companies.create')}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="companies-list">
        <h3>{t('companies.title')} ({companies.length})</h3>
        {companies.length === 0 ? (
          <div className="empty-state">
            <p>{t('companies.noCompanies')}</p>
            <p>{t('companies.createFirst')}</p>
          </div>
        ) : (
          <div className="companies-grid">
            {companies.map(company => (
              <div key={company.companyId} className="company-card">
                <h4>{company.name}</h4>
                {company.abbreviation && (
                  <span className="company-abbreviation">{company.abbreviation}</span>
                )}
                {company.description && (
                  <p className="company-description">{company.description}</p>
                )}
                <div className="company-actions">
                  <button
                    onClick={() => handleEdit(company)}
                    className="company-edit-btn"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(company.companyId)}
                    className="company-delete-btn"
                    disabled={deleting === company.companyId}
                  >
                    {deleting === company.companyId ? t('common.saving') : t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
