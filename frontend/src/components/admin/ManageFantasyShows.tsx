import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  mockShows,
  mockSeasons,
} from '../../mocks/fantasyMockData';
import type { Show, CreateShowInput } from '../../types/fantasy';
import './ManageFantasyShows.css';

export default function ManageFantasyShows() {
  const { t } = useTranslation();
  const [shows, setShows] = useState<Show[]>(mockShows);
  const [showForm, setShowForm] = useState(false);
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateShowInput>({
    seasonId: mockSeasons.find((s) => s.status === 'active')?.seasonId || '',
    name: '',
    date: '',
    picksPerDivision: 2,
    budget: 500,
  });

  const handleOpenForm = (show?: Show) => {
    if (show) {
      setEditingShow(show);
      setFormData({
        seasonId: show.seasonId,
        name: show.name,
        date: show.date.split('T')[0] ?? '',
        picksPerDivision: show.picksPerDivision,
        budget: show.budget,
      });
    } else {
      setEditingShow(null);
      setFormData({
        seasonId: mockSeasons.find((s) => s.status === 'active')?.seasonId || '',
        name: '',
        date: '',
        picksPerDivision: 2,
        budget: 500,
      });
    }
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingShow(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Mock API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingShow) {
        // Update existing show
        setShows((prev) =>
          prev.map((s) =>
            s.showId === editingShow.showId
              ? {
                  ...s,
                  ...formData,
                  date: new Date(formData.date).toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : s
          )
        );
        setSuccess(t('fantasy.admin.shows.updateSuccess'));
      } else {
        // Create new show
        const newShow: Show = {
          showId: `show-${Date.now()}`,
          ...formData,
          date: new Date(formData.date).toISOString(),
          status: 'draft',
          matchIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setShows((prev) => [...prev, newShow]);
        setSuccess(t('fantasy.admin.shows.createSuccess'));
      }

      setShowForm(false);
      setEditingShow(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fantasy.admin.shows.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (showId: string, newStatus: Show['status']) => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setShows((prev) =>
        prev.map((s) =>
          s.showId === showId
            ? { ...s, status: newStatus, updatedAt: new Date().toISOString() }
            : s
        )
      );
      setSuccess(t('fantasy.admin.shows.statusUpdated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fantasy.admin.shows.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (showId: string) => {
    if (!confirm(t('fantasy.admin.shows.confirmDelete'))) return;

    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setShows((prev) => prev.filter((s) => s.showId !== showId));
      setSuccess(t('fantasy.admin.shows.deleteSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fantasy.admin.shows.error'));
    } finally {
      setLoading(false);
    }
  };

  const getSeasonName = (seasonId: string): string => {
    const season = mockSeasons.find((s) => s.seasonId === seasonId);
    return season?.name || 'Unknown';
  };

  const getStatusBadgeClass = (status: Show['status']): string => {
    switch (status) {
      case 'draft':
        return 'status-draft';
      case 'open':
        return 'status-open';
      case 'locked':
        return 'status-locked';
      case 'completed':
        return 'status-completed';
      default:
        return '';
    }
  };

  return (
    <div className="manage-fantasy-shows">
      <header className="shows-header">
        <h2>{t('fantasy.admin.shows.title')}</h2>
        <button className="btn-add" onClick={() => handleOpenForm()}>
          + {t('fantasy.admin.shows.addShow')}
        </button>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="alert">
          {success}
        </div>
      )}

      <div className="shows-table-wrapper">
        <table className="shows-table">
          <thead>
            <tr>
              <th>{t('fantasy.admin.shows.name')}</th>
              <th>{t('fantasy.admin.shows.season')}</th>
              <th>{t('fantasy.admin.shows.date')}</th>
              <th>{t('fantasy.admin.shows.status')}</th>
              <th>{t('fantasy.admin.shows.budget')}</th>
              <th>{t('fantasy.admin.shows.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {shows.map((show) => (
              <tr key={show.showId}>
                <td className="col-name">{show.name}</td>
                <td className="col-season">{getSeasonName(show.seasonId)}</td>
                <td className="col-date">
                  {new Date(show.date).toLocaleDateString()}
                </td>
                <td className="col-status">
                  <span className={`status-badge ${getStatusBadgeClass(show.status)}`}>
                    {t(`fantasy.showStatus.${show.status}`)}
                  </span>
                </td>
                <td className="col-budget">${show.budget}</td>
                <td className="col-actions">
                  <div className="action-buttons">
                    {show.status === 'draft' && (
                      <button
                        className="btn-action btn-open"
                        onClick={() => handleStatusChange(show.showId, 'open')}
                        disabled={loading}
                      >
                        {t('fantasy.admin.shows.open')}
                      </button>
                    )}
                    {show.status === 'open' && (
                      <button
                        className="btn-action btn-lock"
                        onClick={() => handleStatusChange(show.showId, 'locked')}
                        disabled={loading}
                      >
                        {t('fantasy.admin.shows.lock')}
                      </button>
                    )}
                    {show.status === 'locked' && (
                      <>
                        <button
                          className="btn-action btn-unlock"
                          onClick={() => handleStatusChange(show.showId, 'open')}
                          disabled={loading}
                        >
                          {t('fantasy.admin.shows.unlock')}
                        </button>
                        <button
                          className="btn-action btn-complete"
                          onClick={() => handleStatusChange(show.showId, 'completed')}
                          disabled={loading}
                        >
                          {t('fantasy.admin.shows.complete')}
                        </button>
                      </>
                    )}
                    {show.status !== 'completed' && (
                      <button
                        className="btn-action btn-edit"
                        onClick={() => handleOpenForm(show)}
                        disabled={loading}
                      >
                        {t('common.edit')}
                      </button>
                    )}
                    {show.status === 'draft' && (
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDelete(show.showId)}
                        disabled={loading}
                      >
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shows.length === 0 && (
        <div className="no-shows">
          <p>{t('fantasy.admin.shows.noShows')}</p>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>
              {editingShow
                ? t('fantasy.admin.shows.editShow')
                : t('fantasy.admin.shows.addShow')}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="season">{t('fantasy.admin.shows.season')}</label>
                <select
                  id="season"
                  value={formData.seasonId}
                  onChange={(e) => setFormData({ ...formData, seasonId: e.target.value })}
                  required
                >
                  {mockSeasons.map((season) => (
                    <option key={season.seasonId} value={season.seasonId}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="name">{t('fantasy.admin.shows.name')}</label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('fantasy.admin.shows.namePlaceholder')}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="date">{t('fantasy.admin.shows.date')}</label>
                <input
                  type="date"
                  id="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="budget">{t('fantasy.admin.shows.budget')}</label>
                  <input
                    type="number"
                    id="budget"
                    value={formData.budget}
                    onChange={(e) =>
                      setFormData({ ...formData, budget: parseInt(e.target.value) || 0 })
                    }
                    min="100"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="picksPerDivision">
                    {t('fantasy.admin.shows.picksPerDivision')}
                  </label>
                  <input
                    type="number"
                    id="picksPerDivision"
                    value={formData.picksPerDivision}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        picksPerDivision: parseInt(e.target.value) || 1,
                      })
                    }
                    min="1"
                    max="10"
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseForm}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-submit" disabled={loading}>
                  {loading
                    ? t('common.saving')
                    : editingShow
                    ? t('common.save')
                    : t('fantasy.admin.shows.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
