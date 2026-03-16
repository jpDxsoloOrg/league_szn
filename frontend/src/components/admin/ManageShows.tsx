import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { showsApi, companiesApi } from '../../services/api';
import type { Show, Company } from '../../types';
import Skeleton from '../ui/Skeleton';
import './ManageShows.css';

export default function ManageShows() {
  const { t } = useTranslation();
  const [shows, setShows] = useState<Show[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    companyId: '',
    schedule: '' as '' | 'weekly' | 'ppv' | 'special',
    description: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [showsData, companiesData] = await Promise.all([
        showsApi.getAll(),
        companiesApi.getAll(),
      ]);
      setShows(showsData);
      setCompanies(companiesData);
    } catch (_err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getCompanyName = (companyId: string) => {
    const company = companies.find(c => c.companyId === companyId);
    return company?.name || t('common.unknown');
  };

  const getScheduleLabel = (schedule?: string) => {
    if (!schedule) return '-';
    return t(`shows.${schedule}`);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.companyId) {
      setError(t('shows.selectCompany'));
      return;
    }

    try {
      if (editingShow) {
        await showsApi.update(editingShow.showId, {
          name: formData.name,
          companyId: formData.companyId,
          schedule: formData.schedule || undefined,
          description: formData.description || undefined,
        });
        setSuccess(t('shows.edit') + ' - OK');
      } else {
        await showsApi.create({
          name: formData.name,
          companyId: formData.companyId,
          schedule: formData.schedule || undefined,
          description: formData.description || undefined,
        });
        setSuccess(t('shows.create') + ' - OK');
      }

      setFormData({ name: '', companyId: '', schedule: '', description: '' });
      setShowAddForm(false);
      setEditingShow(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save show');
    }
  };

  const handleEdit = (show: Show) => {
    setEditingShow(show);
    setFormData({
      name: show.name,
      companyId: show.companyId,
      schedule: show.schedule || '',
      description: show.description || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (showId: string) => {
    if (!confirm(t('shows.confirmDelete'))) {
      return;
    }

    setDeleting(showId);
    setError(null);
    setSuccess(null);

    try {
      await showsApi.delete(showId);
      setSuccess(t('shows.delete') + ' - OK');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete show');
    } finally {
      setDeleting(null);
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', companyId: '', schedule: '', description: '' });
    setShowAddForm(false);
    setEditingShow(null);
  };

  // Group shows by company
  const showsByCompany = shows.reduce<Record<string, Show[]>>((acc, show) => {
    const key = show.companyId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(show);
    return acc;
  }, {});

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  return (
    <div className="manage-shows">
      <div className="shows-header">
        <h2>{t('shows.title')}</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}>
            {t('shows.create')}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="show-form-container">
          <h3>{editingShow ? t('shows.edit') : t('shows.create')}</h3>
          <form onSubmit={handleSubmit} className="show-form">
            <div className="form-group">
              <label htmlFor="show-name">{t('shows.name')}</label>
              <input
                type="text"
                id="show-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Monday Night Raw, Dynamite"
              />
            </div>

            <div className="form-group">
              <label htmlFor="show-company">{t('shows.company')}</label>
              <select
                id="show-company"
                value={formData.companyId}
                onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                required
              >
                <option value="">{t('shows.selectCompany')}</option>
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="show-schedule">{t('shows.schedule')}</label>
              <select
                id="show-schedule"
                value={formData.schedule}
                onChange={(e) => setFormData({ ...formData, schedule: e.target.value as '' | 'weekly' | 'ppv' | 'special' })}
              >
                <option value="">-</option>
                <option value="weekly">{t('shows.weekly')}</option>
                <option value="ppv">{t('shows.ppv')}</option>
                <option value="special">{t('shows.special')}</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="show-description">{t('shows.description')}</label>
              <textarea
                id="show-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this show"
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button type="submit">
                {editingShow ? t('shows.edit') : t('shows.create')}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="shows-list">
        <h3>{t('shows.title')} ({shows.length})</h3>
        {shows.length === 0 ? (
          <div className="empty-state">
            <p>{t('shows.noShows')}</p>
            <p>{t('shows.createFirst')}</p>
          </div>
        ) : (
          <div className="shows-by-company">
            {Object.entries(showsByCompany).map(([companyId, companyShows]) => (
              <div key={companyId} className="company-shows-group">
                <h4 className="company-group-title">{getCompanyName(companyId)}</h4>
                <div className="shows-grid">
                  {companyShows.map(show => (
                    <div key={show.showId} className="show-card">
                      <h4>{show.name}</h4>
                      <div className="show-meta">
                        <span className="show-schedule-badge">
                          {getScheduleLabel(show.schedule)}
                        </span>
                      </div>
                      {show.description && (
                        <p className="show-description">{show.description}</p>
                      )}
                      <div className="show-actions">
                        <button
                          onClick={() => handleEdit(show)}
                          className="show-edit-btn"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(show.showId)}
                          className="show-delete-btn"
                          disabled={deleting === show.showId}
                        >
                          {deleting === show.showId ? t('common.saving') : t('common.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
