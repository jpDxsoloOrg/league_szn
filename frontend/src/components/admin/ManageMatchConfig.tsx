import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { matchTypesApi, stipulationsApi } from '../../services/api';
import type { MatchType, Stipulation } from '../../types';
import './ManageMatchConfig.css';

type ConfigTab = 'matchTypes' | 'stipulations';

export default function ManageMatchConfig() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ConfigTab>('matchTypes');

  // Match Types state
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [matchTypesLoading, setMatchTypesLoading] = useState(true);
  const [matchTypesError, setMatchTypesError] = useState<string | null>(null);
  const [matchTypesSuccess, setMatchTypesSuccess] = useState<string | null>(null);
  const [showMatchTypeForm, setShowMatchTypeForm] = useState(false);
  const [editingMatchType, setEditingMatchType] = useState<MatchType | null>(null);
  const [deletingMatchType, setDeletingMatchType] = useState<string | null>(null);
  const [matchTypeFormData, setMatchTypeFormData] = useState({
    name: '',
    description: '',
  });

  // Stipulations state
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [stipulationsLoading, setStipulationsLoading] = useState(true);
  const [stipulationsError, setStipulationsError] = useState<string | null>(null);
  const [stipulationsSuccess, setStipulationsSuccess] = useState<string | null>(null);
  const [showStipulationForm, setShowStipulationForm] = useState(false);
  const [editingStipulation, setEditingStipulation] = useState<Stipulation | null>(null);
  const [deletingStipulation, setDeletingStipulation] = useState<string | null>(null);
  const [stipulationFormData, setStipulationFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    loadMatchTypes();
    loadStipulations();
  }, []);

  // ─── Match Types handlers ───

  const loadMatchTypes = async () => {
    try {
      setMatchTypesLoading(true);
      const data = await matchTypesApi.getAll();
      setMatchTypes(data);
    } catch (_err) {
      setMatchTypesError('Failed to load match types');
    } finally {
      setMatchTypesLoading(false);
    }
  };

  const handleMatchTypeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMatchTypesError(null);
    setMatchTypesSuccess(null);

    try {
      if (editingMatchType) {
        await matchTypesApi.update(editingMatchType.matchTypeId, {
          name: matchTypeFormData.name,
          description: matchTypeFormData.description || undefined,
        });
        setMatchTypesSuccess('Match type updated successfully!');
      } else {
        await matchTypesApi.create({
          name: matchTypeFormData.name,
          description: matchTypeFormData.description || undefined,
        });
        setMatchTypesSuccess('Match type created successfully!');
      }

      setMatchTypeFormData({ name: '', description: '' });
      setShowMatchTypeForm(false);
      setEditingMatchType(null);
      await loadMatchTypes();
    } catch (err) {
      setMatchTypesError(err instanceof Error ? err.message : 'Failed to save match type');
    }
  };

  const handleMatchTypeEdit = (matchType: MatchType) => {
    setEditingMatchType(matchType);
    setMatchTypeFormData({
      name: matchType.name,
      description: matchType.description || '',
    });
    setShowMatchTypeForm(true);
  };

  const handleMatchTypeDelete = async (matchTypeId: string) => {
    if (!confirm('Are you sure you want to delete this match type?')) {
      return;
    }

    setDeletingMatchType(matchTypeId);
    setMatchTypesError(null);
    setMatchTypesSuccess(null);

    try {
      await matchTypesApi.delete(matchTypeId);
      setMatchTypesSuccess('Match type deleted successfully!');
      await loadMatchTypes();
    } catch (err) {
      setMatchTypesError(err instanceof Error ? err.message : 'Failed to delete match type');
    } finally {
      setDeletingMatchType(null);
    }
  };

  const handleMatchTypeCancel = () => {
    setMatchTypeFormData({ name: '', description: '' });
    setShowMatchTypeForm(false);
    setEditingMatchType(null);
  };

  // ─── Stipulations handlers ───

  const loadStipulations = async () => {
    try {
      setStipulationsLoading(true);
      const data = await stipulationsApi.getAll();
      setStipulations(data);
    } catch (_err) {
      setStipulationsError('Failed to load stipulations');
    } finally {
      setStipulationsLoading(false);
    }
  };

  const handleStipulationSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStipulationsError(null);
    setStipulationsSuccess(null);

    try {
      if (editingStipulation) {
        await stipulationsApi.update(editingStipulation.stipulationId, {
          name: stipulationFormData.name,
          description: stipulationFormData.description || undefined,
        });
        setStipulationsSuccess('Stipulation updated successfully!');
      } else {
        await stipulationsApi.create({
          name: stipulationFormData.name,
          description: stipulationFormData.description || undefined,
        });
        setStipulationsSuccess('Stipulation created successfully!');
      }

      setStipulationFormData({ name: '', description: '' });
      setShowStipulationForm(false);
      setEditingStipulation(null);
      await loadStipulations();
    } catch (err) {
      setStipulationsError(err instanceof Error ? err.message : 'Failed to save stipulation');
    }
  };

  const handleStipulationEdit = (stipulation: Stipulation) => {
    setEditingStipulation(stipulation);
    setStipulationFormData({
      name: stipulation.name,
      description: stipulation.description || '',
    });
    setShowStipulationForm(true);
  };

  const handleStipulationDelete = async (stipulationId: string) => {
    if (!confirm('Are you sure you want to delete this stipulation?')) {
      return;
    }

    setDeletingStipulation(stipulationId);
    setStipulationsError(null);
    setStipulationsSuccess(null);

    try {
      await stipulationsApi.delete(stipulationId);
      setStipulationsSuccess('Stipulation deleted successfully!');
      await loadStipulations();
    } catch (err) {
      setStipulationsError(err instanceof Error ? err.message : 'Failed to delete stipulation');
    } finally {
      setDeletingStipulation(null);
    }
  };

  const handleStipulationCancel = () => {
    setStipulationFormData({ name: '', description: '' });
    setShowStipulationForm(false);
    setEditingStipulation(null);
  };

  // ─── Tab switch handler ───

  const handleTabChange = (tab: ConfigTab) => {
    setActiveTab(tab);
  };

  // ─── Render helpers ───

  const renderMatchTypesTab = () => {
    if (matchTypesLoading) {
      return <div className="loading">Loading match types...</div>;
    }

    return (
      <>
        <div className="match-config-header">
          <h2>Match Types</h2>
          {!showMatchTypeForm && (
            <button onClick={() => setShowMatchTypeForm(true)}>
              Create Match Type
            </button>
          )}
        </div>

        {matchTypesError && <div className="error-message">{matchTypesError}</div>}
        {matchTypesSuccess && <div className="success-message">{matchTypesSuccess}</div>}

        {showMatchTypeForm && (
          <div className="match-config-form-container">
            <h3>{editingMatchType ? 'Edit Match Type' : 'Create New Match Type'}</h3>
            <form onSubmit={handleMatchTypeSubmit} className="match-config-form">
              <div className="form-group">
                <label htmlFor="matchTypeName">Match Type Name</label>
                <input
                  type="text"
                  id="matchTypeName"
                  value={matchTypeFormData.name}
                  onChange={(e) => setMatchTypeFormData({ ...matchTypeFormData, name: e.target.value })}
                  required
                  placeholder="e.g., Singles, Tag Team, Triple Threat, Fatal 4-Way"
                />
              </div>

              <div className="form-group">
                <label htmlFor="matchTypeDescription">{t('common.description', 'Description')} ({t('common.optional', 'Optional')})</label>
                <textarea
                  id="matchTypeDescription"
                  value={matchTypeFormData.description}
                  onChange={(e) => setMatchTypeFormData({ ...matchTypeFormData, description: e.target.value })}
                  placeholder="Brief description of this match type"
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button type="submit">
                  {editingMatchType ? 'Update Match Type' : 'Create Match Type'}
                </button>
                <button type="button" onClick={handleMatchTypeCancel} className="cancel-btn">
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="match-config-list">
          <h3>All Match Types ({matchTypes.length})</h3>
          {matchTypes.length === 0 ? (
            <p>No match types yet. Create your first match type!</p>
          ) : (
            <div className="match-config-grid">
              {matchTypes.map(matchType => (
                <div key={matchType.matchTypeId} className="match-config-card">
                  <h4>{matchType.name}</h4>
                  {matchType.description && (
                    <p className="match-config-description">{matchType.description}</p>
                  )}
                  <div className="match-config-actions">
                    <button
                      onClick={() => handleMatchTypeEdit(matchType)}
                      className="match-config-edit-btn"
                    >
                      {t('common.edit', 'Edit')}
                    </button>
                    <button
                      onClick={() => handleMatchTypeDelete(matchType.matchTypeId)}
                      className="match-config-delete-btn"
                      disabled={deletingMatchType === matchType.matchTypeId}
                    >
                      {deletingMatchType === matchType.matchTypeId ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderStipulationsTab = () => {
    if (stipulationsLoading) {
      return <div className="loading">Loading stipulations...</div>;
    }

    return (
      <>
        <div className="match-config-header">
          <h2>{t('admin.stipulations', 'Stipulations')}</h2>
          {!showStipulationForm && (
            <button onClick={() => setShowStipulationForm(true)}>
              {t('admin.createStipulation', 'Create Stipulation')}
            </button>
          )}
        </div>

        {stipulationsError && <div className="error-message">{stipulationsError}</div>}
        {stipulationsSuccess && <div className="success-message">{stipulationsSuccess}</div>}

        {showStipulationForm && (
          <div className="match-config-form-container">
            <h3>{editingStipulation ? t('admin.editStipulation', 'Edit Stipulation') : t('admin.createNewStipulation', 'Create New Stipulation')}</h3>
            <form onSubmit={handleStipulationSubmit} className="match-config-form">
              <div className="form-group">
                <label htmlFor="stipulationName">{t('admin.stipulationName', 'Stipulation Name')}</label>
                <input
                  type="text"
                  id="stipulationName"
                  value={stipulationFormData.name}
                  onChange={(e) => setStipulationFormData({ ...stipulationFormData, name: e.target.value })}
                  required
                  placeholder="e.g., Ladder Match, Steel Cage, Hell in a Cell"
                />
              </div>

              <div className="form-group">
                <label htmlFor="stipulationDescription">{t('common.description', 'Description')} ({t('common.optional', 'Optional')})</label>
                <textarea
                  id="stipulationDescription"
                  value={stipulationFormData.description}
                  onChange={(e) => setStipulationFormData({ ...stipulationFormData, description: e.target.value })}
                  placeholder="Brief description of this stipulation"
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button type="submit">
                  {editingStipulation ? t('admin.updateStipulation', 'Update Stipulation') : t('admin.createStipulation', 'Create Stipulation')}
                </button>
                <button type="button" onClick={handleStipulationCancel} className="cancel-btn">
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="match-config-list">
          <h3>{t('admin.allStipulations', 'All Stipulations')} ({stipulations.length})</h3>
          {stipulations.length === 0 ? (
            <p>{t('admin.noStipulations', 'No stipulations yet. Create your first stipulation!')}</p>
          ) : (
            <div className="match-config-grid">
              {stipulations.map(stipulation => (
                <div key={stipulation.stipulationId} className="match-config-card">
                  <h4>{stipulation.name}</h4>
                  {stipulation.description && (
                    <p className="match-config-description">{stipulation.description}</p>
                  )}
                  <div className="match-config-actions">
                    <button
                      onClick={() => handleStipulationEdit(stipulation)}
                      className="match-config-edit-btn"
                    >
                      {t('common.edit', 'Edit')}
                    </button>
                    <button
                      onClick={() => handleStipulationDelete(stipulation.stipulationId)}
                      className="match-config-delete-btn"
                      disabled={deletingStipulation === stipulation.stipulationId}
                    >
                      {deletingStipulation === stipulation.stipulationId ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="manage-match-config">
      <div className="match-config-tabs">
        <button
          className={`match-config-tab-btn ${activeTab === 'matchTypes' ? 'active' : ''}`}
          onClick={() => handleTabChange('matchTypes')}
        >
          Match Types
        </button>
        <button
          className={`match-config-tab-btn ${activeTab === 'stipulations' ? 'active' : ''}`}
          onClick={() => handleTabChange('stipulations')}
        >
          {t('admin.stipulations', 'Stipulations')}
        </button>
      </div>

      {activeTab === 'matchTypes' && renderMatchTypesTab()}
      {activeTab === 'stipulations' && renderStipulationsTab()}
    </div>
  );
}
