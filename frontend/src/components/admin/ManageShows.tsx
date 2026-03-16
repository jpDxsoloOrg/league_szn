import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { showsApi, companiesApi, imagesApi } from '../../services/api';
import type { Show, Company, DayOfWeek } from '../../types';
import { FILE_UPLOAD_LIMITS } from '../../constants';
import Skeleton from '../ui/Skeleton';
import './ManageShows.css';

const DAYS_OF_WEEK: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    companyId: '',
    schedule: '' as '' | 'weekly' | 'ppv' | 'special',
    dayOfWeek: '' as '' | DayOfWeek,
    description: '',
    imageUrl: '',
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

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!FILE_UPLOAD_LIMITS.ALLOWED_TYPES.includes(file.type as typeof FILE_UPLOAD_LIMITS.ALLOWED_TYPES[number])) {
        setError(`Invalid file type. Only ${FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS} images are allowed.`);
        return;
      }
      if (file.size > FILE_UPLOAD_LIMITS.MAX_SIZE) {
        setError(`File too large. Maximum size is ${FILE_UPLOAD_LIMITS.MAX_SIZE_MB}MB.`);
        return;
      }
      setSelectedFile(file);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setFormData({ ...formData, imageUrl: '' });
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!selectedFile) return formData.imageUrl || null;
    try {
      setUploading(true);
      const response = await imagesApi.generateUploadUrl(
        selectedFile.name,
        selectedFile.type,
        'shows'
      );
      await imagesApi.uploadToS3(response.uploadUrl, selectedFile);
      return response.imageUrl;
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        throw new Error('Session expired. Please log in again to upload images.');
      }
      throw new Error('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    setError(null);
    setSuccess(null);

    if (!formData.companyId) {
      setError(t('shows.selectCompany'));
      return;
    }

    try {
      const imageUrl = await uploadImage();

      if (editingShow) {
        await showsApi.update(editingShow.showId, {
          name: formData.name,
          companyId: formData.companyId,
          schedule: formData.schedule || undefined,
          dayOfWeek: (formData.schedule === 'weekly' && formData.dayOfWeek) ? formData.dayOfWeek : undefined,
          description: formData.description || undefined,
          imageUrl: imageUrl || undefined,
        });
        setSuccess(t('shows.edit') + ' - OK');
      } else {
        await showsApi.create({
          name: formData.name,
          companyId: formData.companyId,
          schedule: formData.schedule || undefined,
          dayOfWeek: (formData.schedule === 'weekly' && formData.dayOfWeek) ? formData.dayOfWeek : undefined,
          description: formData.description || undefined,
          imageUrl: imageUrl || undefined,
        });
        setSuccess(t('shows.create') + ' - OK');
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save show');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', companyId: '', schedule: '', dayOfWeek: '', description: '', imageUrl: '' });
    setSelectedFile(null);
    setImagePreview(null);
    setShowAddForm(false);
    setEditingShow(null);
  };

  const handleEdit = (show: Show) => {
    setEditingShow(show);
    setFormData({
      name: show.name,
      companyId: show.companyId,
      schedule: show.schedule || '',
      dayOfWeek: show.dayOfWeek || '',
      description: show.description || '',
      imageUrl: show.imageUrl || '',
    });
    setImagePreview(show.imageUrl || null);
    setSelectedFile(null);
    setShowAddForm(true);
  };

  const handleDelete = async (showId: string) => {
    if (!confirm(t('shows.confirmDelete'))) return;
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
          <button onClick={() => setShowAddForm(true)}>{t('shows.create')}</button>
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
              <input type="text" id="show-name" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required placeholder="e.g., Monday Night Raw, Dynamite" />
            </div>

            <div className="form-group">
              <label htmlFor="show-company">{t('shows.company')}</label>
              <select id="show-company" value={formData.companyId}
                onChange={(e) => setFormData({ ...formData, companyId: e.target.value })} required>
                <option value="">{t('shows.selectCompany')}</option>
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>{company.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="show-schedule">{t('shows.schedule')}</label>
              <select id="show-schedule" value={formData.schedule}
                onChange={(e) => setFormData({ ...formData, schedule: e.target.value as '' | 'weekly' | 'ppv' | 'special' })}>
                <option value="">-</option>
                <option value="weekly">{t('shows.weekly')}</option>
                <option value="ppv">{t('shows.ppv')}</option>
                <option value="special">{t('shows.special')}</option>
              </select>
            </div>

            {formData.schedule === 'weekly' && (
              <div className="form-group">
                <label htmlFor="show-day">{t('shows.dayOfWeek')}</label>
                <select id="show-day" value={formData.dayOfWeek}
                  onChange={(e) => setFormData({ ...formData, dayOfWeek: e.target.value as '' | DayOfWeek })}>
                  <option value="">{t('shows.selectDay')}</option>
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day}>{t(`shows.${day}`)}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="show-description">{t('shows.description')}</label>
              <textarea id="show-description" value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this show" rows={3} />
            </div>

            <div className="form-group">
              <label>{t('shows.image')}</label>
              <div className="show-image-section">
                {imagePreview ? (
                  <div className="show-image-preview">
                    <img src={imagePreview} alt="Preview" />
                    <button type="button" onClick={clearImage} className="remove-image-btn">
                      {t('shows.removeImage')}
                    </button>
                  </div>
                ) : (
                  <div className="show-image-upload">
                    <input type="file" id="show-image" accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleFileSelect} />
                    <label htmlFor="show-image" className="show-image-upload-btn">
                      {t('shows.uploadImage')}
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={uploading}>
                {uploading ? t('common.saving') : (editingShow ? t('shows.edit') : t('shows.create'))}
              </button>
              <button type="button" onClick={() => resetForm()} className="cancel-btn">
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
                      {show.imageUrl && (
                        <div className="show-card-image">
                          <img src={show.imageUrl} alt={show.name} />
                        </div>
                      )}
                      <h4>{show.name}</h4>
                      <div className="show-meta">
                        <span className="show-schedule-badge">{getScheduleLabel(show.schedule)}</span>
                        {show.dayOfWeek && show.schedule === 'weekly' && (
                          <span className="show-day-badge">{t(`shows.${show.dayOfWeek}`)}</span>
                        )}
                      </div>
                      {show.description && <p className="show-description">{show.description}</p>}
                      <div className="show-actions">
                        <button onClick={() => handleEdit(show)} className="show-edit-btn">{t('common.edit')}</button>
                        <button onClick={() => handleDelete(show.showId)} className="show-delete-btn"
                          disabled={deleting === show.showId}>
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
