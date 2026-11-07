import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Tv } from 'lucide-react';
import { showsApi, companiesApi, imagesApi, isApiError } from '../../services/api';
import type { Show, Company, DayOfWeek } from '../../types';
import { FILE_UPLOAD_LIMITS } from '../../constants';
import { formatCalendarDate } from '../../utils/dateUtils';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

const DAYS_OF_WEEK: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function ManageShows() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [shows, setShows] = useState<Show[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingShow, setEditingShow] = useState<Show | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    companyId: '',
    schedule: '' as '' | 'weekly' | 'ppv' | 'special',
    dayOfWeek: '' as '' | DayOfWeek,
    ppvDate: '',
    description: '',
    imageUrl: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [showsData, companiesData] = await Promise.all([
        showsApi.getAll(),
        companiesApi.getAll(),
      ]);
      setShows(showsData);
      setCompanies(companiesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
        setFormError(t('adminContent.invalidImageType', 'Invalid file type. Only {{types}} images are allowed.', { types: FILE_UPLOAD_LIMITS.ALLOWED_EXTENSIONS }));
        return;
      }
      if (file.size > FILE_UPLOAD_LIMITS.MAX_SIZE) {
        setFormError(t('adminContent.imageTooLarge', 'File too large. Maximum size is {{size}}MB.', { size: FILE_UPLOAD_LIMITS.MAX_SIZE_MB }));
        return;
      }
      setSelectedFile(file);
      setFormError(null);
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
      if (isApiError(err, 401)) {
        throw new Error(t('adminContent.sessionExpired', 'Session expired. Please log in again to upload images.'));
      }
      throw new Error(t('adminContent.uploadFailed', 'Failed to upload image. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (uploading || saving) return;
    setError(null);
    setSuccess(null);
    setFormError(null);

    if (!formData.companyId) {
      setFormError(t('shows.selectCompany'));
      return;
    }
    if (formData.schedule === 'ppv' && !formData.ppvDate) {
      setFormError(t('shows.selectPpvDate'));
      return;
    }

    setSaving(true);
    try {
      const imageUrl = await uploadImage();
      const input = {
        name: formData.name,
        companyId: formData.companyId,
        schedule: formData.schedule || undefined,
        dayOfWeek: (formData.schedule === 'weekly' && formData.dayOfWeek) ? formData.dayOfWeek : undefined,
        ppvDate: formData.schedule === 'ppv' ? new Date(formData.ppvDate).toISOString() : undefined,
        description: formData.description || undefined,
        imageUrl: imageUrl || undefined,
      };

      if (editingShow) {
        await showsApi.update(editingShow.showId, input);
        setSuccess(t('adminContent.shows.updated', 'Show updated'));
      } else {
        await showsApi.create(input);
        setSuccess(t('adminContent.shows.created', 'Show created'));
      }

      resetForm();
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('adminContent.shows.saveFailed', 'Failed to save show'));
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', companyId: '', schedule: '', dayOfWeek: '', ppvDate: '', description: '', imageUrl: '' });
    setSelectedFile(null);
    setImagePreview(null);
    setShowAddForm(false);
    setEditingShow(null);
    setFormError(null);
  };

  const handleEdit = (show: Show) => {
    setEditingShow(show);
    setFormData({
      name: show.name,
      companyId: show.companyId,
      schedule: show.schedule || '',
      dayOfWeek: show.dayOfWeek || '',
      ppvDate: show.ppvDate ? show.ppvDate.slice(0, 10) : '',
      description: show.description || '',
      imageUrl: show.imageUrl || '',
    });
    setImagePreview(show.imageUrl || null);
    setSelectedFile(null);
    setShowAddForm(true);
  };

  const handleDelete = async (showId: string) => {
    const confirmed = await confirm({ title: t('shows.confirmDelete'), confirmLabel: t('common.delete') });
    if (!confirmed) return;

    setDeleting(showId);
    setError(null);
    setSuccess(null);
    try {
      await showsApi.delete(showId);
      setSuccess(t('adminContent.shows.deleted', 'Show deleted'));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.shows.deleteFailed', 'Failed to delete show'));
    } finally {
      setDeleting(null);
    }
  };

  const title = t('shows.title');

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
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowAddForm(true)}>
            {t('shows.create')}
          </Button>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <DataTable
        caption={title}
        density="dense"
        rows={shows}
        rowKey={(show) => show.showId}
        empty={(
          <EmptyState
            icon={<Tv aria-hidden="true" size={32} />}
            title={t('shows.noShows')}
            description={t('shows.createFirst')}
          />
        )}
        columns={[
          {
            key: 'name',
            header: t('shows.name'),
            render: (show) => (
              <span className="ac-cell">
                {show.imageUrl && <img src={show.imageUrl} alt="" className="ac-thumb" />}
                <span className="ac-cell__text">
                  <span className="ac-cell__title">{show.name}</span>
                  {show.description && <span className="ac-cell__sub">{show.description}</span>}
                </span>
              </span>
            ),
            sortValue: (show) => show.name,
          },
          {
            key: 'company',
            header: t('shows.company'),
            render: (show) => getCompanyName(show.companyId),
            sortValue: (show) => getCompanyName(show.companyId),
          },
          {
            key: 'schedule',
            header: t('shows.schedule'),
            render: (show) => (
              <span className="ac-badges">
                <Badge tone="violet">{getScheduleLabel(show.schedule)}</Badge>
                {show.dayOfWeek && show.schedule === 'weekly' && <span>{t(`shows.${show.dayOfWeek}`)}</span>}
                {show.ppvDate && show.schedule === 'ppv' && <span>{formatCalendarDate(show.ppvDate)}</span>}
              </span>
            ),
          },
          {
            key: 'actions',
            header: t('common.actions'),
            align: 'end',
            render: (show) => (
              <div className="ac-actions ac-actions--end">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(show)}>{t('common.edit')}</Button>
                <Button variant="ghost" size="sm" loading={deleting === show.showId} onClick={() => handleDelete(show.showId)}>
                  {t('common.delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <AdminFormModal
        open={showAddForm}
        onClose={resetForm}
        title={editingShow ? t('shows.edit') : t('shows.create')}
        submitLabel={editingShow ? t('shows.update', 'Update Show') : t('shows.create')}
        onSubmit={handleSubmit}
        busy={saving || uploading}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="show-name">{t('shows.name')}</label>
          <input
            type="text"
            id="show-name"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            required
            placeholder={t('adminContent.shows.namePlaceholder', 'e.g., Monday Night Raw, Dynamite')}
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="show-company">{t('shows.company')}</label>
          <select
            id="show-company"
            value={formData.companyId}
            onChange={(event) => setFormData({ ...formData, companyId: event.target.value })}
            required
          >
            <option value="">{t('shows.selectCompany')}</option>
            {companies.map((company) => (
              <option key={company.companyId} value={company.companyId}>{company.name}</option>
            ))}
          </select>
        </div>
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="show-schedule">{t('shows.schedule')}</label>
            <select
              id="show-schedule"
              value={formData.schedule}
              onChange={(event) => setFormData({ ...formData, schedule: event.target.value as '' | 'weekly' | 'ppv' | 'special' })}
            >
              <option value="">-</option>
              <option value="weekly">{t('shows.weekly')}</option>
              <option value="ppv">{t('shows.ppv')}</option>
              <option value="special">{t('shows.special')}</option>
            </select>
          </div>
          {formData.schedule === 'weekly' && (
            <div className="ac-field">
              <label className="ac-field__label" htmlFor="show-day">{t('shows.dayOfWeek')}</label>
              <select
                id="show-day"
                value={formData.dayOfWeek}
                onChange={(event) => setFormData({ ...formData, dayOfWeek: event.target.value as '' | DayOfWeek })}
              >
                <option value="">{t('shows.selectDay')}</option>
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day} value={day}>{t(`shows.${day}`)}</option>
                ))}
              </select>
            </div>
          )}
          {formData.schedule === 'ppv' && (
            <div className="ac-field">
              <label className="ac-field__label" htmlFor="show-ppv-date">{t('shows.ppvDate')}</label>
              <input
                type="date"
                id="show-ppv-date"
                value={formData.ppvDate}
                onChange={(event) => setFormData({ ...formData, ppvDate: event.target.value })}
                required
              />
            </div>
          )}
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="show-description">{t('shows.description')}</label>
          <textarea
            id="show-description"
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            placeholder={t('adminContent.shows.descriptionPlaceholder', 'Brief description of this show')}
            rows={3}
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="show-image">{t('shows.image')}</label>
          {imagePreview ? (
            <div className="ac-image-preview">
              <img src={imagePreview} alt="" />
              <Button variant="ghost" size="sm" onClick={clearImage}>{t('shows.removeImage')}</Button>
            </div>
          ) : (
            <input type="file" id="show-image" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleFileSelect} />
          )}
        </div>
      </AdminFormModal>

      {confirmDialog}
    </div>
  );
}
