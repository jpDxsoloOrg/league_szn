import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { wrestlersApi } from '../../services/api';
import {
  OVERALL_CAP_MAX,
  OVERALL_CAP_MIN,
  WRESTLER_PROMOTIONS,
  type Wrestler,
  type WrestlerImportResult,
  type WrestlerPromotion,
} from '../../types';
import Skeleton from '../ui/Skeleton';
import './ManageWrestlers.css';

type ParsedRow = {
  promotion: WrestlerPromotion;
  name: string;
  overallCap: number;
};

type ParseOutcome = {
  rows: ParsedRow[];
  errors: Array<{ row: number; reason: string }>;
};

const DEFAULT_FORM_DATA = {
  promotion: WRESTLER_PROMOTIONS[0],
  name: '',
  overallCap: OVERALL_CAP_MIN,
};

const PAGE_SIZE = 25;

function isWrestlerPromotion(value: string): value is WrestlerPromotion {
  return (WRESTLER_PROMOTIONS as readonly string[]).includes(value);
}

/**
 * Small CSV parser supporting quoted fields and double-quote escapes.
 * Returns an array of string arrays (one per row).
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }
    currentField += ch;
  }

  // Flush last field/row if non-empty
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Drop trailing empty rows (e.g., trailing newline)
  return rows.filter((row) => !(row.length === 1 && row[0] === ''));
}

function validateRow(
  rawPromotion: string,
  rawName: string,
  rawOverallCap: string | number,
  rowIndex: number,
): { ok: true; row: ParsedRow } | { ok: false; reason: string; row: number } {
  const promotion = typeof rawPromotion === 'string' ? rawPromotion.trim().toUpperCase() : '';
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const overallCap =
    typeof rawOverallCap === 'number' ? rawOverallCap : Number(String(rawOverallCap).trim());

  if (!isWrestlerPromotion(promotion)) {
    return {
      ok: false,
      row: rowIndex,
      reason: `invalid promotion "${rawPromotion}" (must be one of: ${WRESTLER_PROMOTIONS.join(', ')})`,
    };
  }
  if (name.length === 0 || name.length > 128) {
    return { ok: false, row: rowIndex, reason: 'name must be a non-empty string up to 128 chars' };
  }
  if (
    !Number.isFinite(overallCap) ||
    !Number.isInteger(overallCap) ||
    overallCap < OVERALL_CAP_MIN ||
    overallCap > OVERALL_CAP_MAX
  ) {
    return {
      ok: false,
      row: rowIndex,
      reason: `overallCap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`,
    };
  }
  return { ok: true, row: { promotion, name, overallCap } };
}

function parseImportText(text: string, filename: string): ParseOutcome {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { rows: [], errors: [{ row: 0, reason: 'file is empty' }] };
  }

  const isJson =
    filename.toLowerCase().endsWith('.json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  const rows: ParsedRow[] = [];
  const errors: Array<{ row: number; reason: string }> = [];

  if (isJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return {
        rows: [],
        errors: [
          {
            row: 0,
            reason: `failed to parse JSON: ${err instanceof Error ? err.message : 'unknown error'}`,
          },
        ],
      };
    }

    let list: unknown[];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'wrestlers' in parsed &&
      Array.isArray((parsed as { wrestlers: unknown }).wrestlers)
    ) {
      list = (parsed as { wrestlers: unknown[] }).wrestlers;
    } else {
      return {
        rows: [],
        errors: [
          {
            row: 0,
            reason: 'JSON must be an array of wrestlers or an object with a `wrestlers` array',
          },
        ],
      };
    }

    list.forEach((item, idx) => {
      const rowNum = idx + 1;
      if (item === null || typeof item !== 'object') {
        errors.push({ row: rowNum, reason: 'row must be an object' });
        return;
      }
      const record = item as Record<string, unknown>;
      const rawPromotion = record['promotion'];
      const rawName = record['name'];
      const rawOverallCap = record['overallCap'];
      const result = validateRow(
        typeof rawPromotion === 'string' ? rawPromotion : String(rawPromotion ?? ''),
        typeof rawName === 'string' ? rawName : String(rawName ?? ''),
        typeof rawOverallCap === 'number' ? rawOverallCap : String(rawOverallCap ?? ''),
        rowNum,
      );
      if (result.ok) rows.push(result.row);
      else errors.push({ row: result.row, reason: result.reason });
    });

    return { rows, errors };
  }

  // CSV path
  const csv = parseCsv(text);
  if (csv.length === 0) {
    return { rows: [], errors: [{ row: 0, reason: 'CSV has no rows' }] };
  }

  const headerRow = csv[0];
  if (!headerRow) {
    return { rows: [], errors: [{ row: 0, reason: 'CSV has no header row' }] };
  }
  const header = headerRow.map((cell) => cell.trim().toLowerCase());
  const promotionIdx = header.indexOf('promotion');
  const nameIdx = header.indexOf('name');
  const overallCapIdx = header.indexOf('overallcap');

  if (promotionIdx === -1 || nameIdx === -1 || overallCapIdx === -1) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          reason: 'CSV header must include columns: promotion, name, overallCap',
        },
      ],
    };
  }

  for (let i = 1; i < csv.length; i++) {
    const row = csv[i];
    if (!row) continue;
    const rowNum = i + 1;
    const rawPromotion = row[promotionIdx] ?? '';
    const rawName = row[nameIdx] ?? '';
    const rawOverallCap = row[overallCapIdx] ?? '';
    const result = validateRow(rawPromotion, rawName, rawOverallCap, rowNum);
    if (result.ok) rows.push(result.row);
    else errors.push({ row: result.row, reason: result.reason });
  }

  return { rows, errors };
}

export default function ManageWrestlers() {
  const { t } = useTranslation();
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingWrestler, setEditingWrestler] = useState<Wrestler | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [resettingAssignments, setResettingAssignments] = useState(false);
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState<{
    promotion: WrestlerPromotion;
    name: string;
    overallCap: number;
  }>(DEFAULT_FORM_DATA);

  const [filter, setFilter] = useState<{
    promotion: WrestlerPromotion | '';
    onlyAvailable: boolean;
  }>({ promotion: '', onlyAvailable: false });

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ParsedRow[] | null>(null);
  const [importParseErrors, setImportParseErrors] = useState<
    Array<{ row: number; reason: string }>
  >([]);
  const [importResult, setImportResult] = useState<WrestlerImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadWrestlers();
  }, []);

  const loadWrestlers = async () => {
    try {
      setLoading(true);
      const data = await wrestlersApi.getAll();
      setWrestlers(data);
    } catch (_err) {
      setError('Failed to load wrestlers');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(DEFAULT_FORM_DATA);
    setShowAddForm(false);
    setEditingWrestler(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = formData.name.trim();
    if (trimmedName.length === 0) {
      setError('Name is required');
      return;
    }
    if (
      !Number.isInteger(formData.overallCap) ||
      formData.overallCap < OVERALL_CAP_MIN ||
      formData.overallCap > OVERALL_CAP_MAX
    ) {
      setError(`Overall Cap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`);
      return;
    }

    try {
      if (editingWrestler) {
        await wrestlersApi.update(editingWrestler.wrestlerId, {
          promotion: formData.promotion,
          name: trimmedName,
          overallCap: formData.overallCap,
        });
        setSuccess('Wrestler updated successfully!');
      } else {
        await wrestlersApi.create({
          promotion: formData.promotion,
          name: trimmedName,
          overallCap: formData.overallCap,
        });
        setSuccess('Wrestler created successfully!');
      }

      resetForm();
      await loadWrestlers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save wrestler');
    }
  };

  const handleEdit = (wrestler: Wrestler) => {
    setEditingWrestler(wrestler);
    setFormData({
      promotion: wrestler.promotion,
      name: wrestler.name,
      overallCap: wrestler.overallCap,
    });
    setShowAddForm(true);
  };

  const handleDelete = async (wrestlerId: string) => {
    if (!confirm('Are you sure you want to delete this wrestler?')) {
      return;
    }

    setDeleting(wrestlerId);
    setError(null);
    setSuccess(null);

    try {
      await wrestlersApi.delete(wrestlerId);
      setSuccess('Wrestler deleted successfully!');
      await loadWrestlers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete wrestler');
    } finally {
      setDeleting(null);
    }
  };

  const handleRelease = async (wrestler: Wrestler) => {
    if (
      !confirm(
        `Release "${wrestler.name}"? They will be marked as available. Note: this does not currently un-assign them from a player (P1 feature).`,
      )
    ) {
      return;
    }

    setReleasing(wrestler.wrestlerId);
    setError(null);
    setSuccess(null);

    try {
      await wrestlersApi.update(wrestler.wrestlerId, { isInUse: false });
      setSuccess('Wrestler released successfully!');
      await loadWrestlers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release wrestler');
    } finally {
      setReleasing(null);
    }
  };

  const handleCancel = () => {
    resetForm();
  };

  const handleResetAssignments = async () => {
    if (!confirm(t('admin.manageWrestlers.resetConfirm'))) {
      return;
    }

    setResettingAssignments(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await wrestlersApi.resetAssignments();
      setSuccess(
        t('admin.manageWrestlers.resetSuccess', {
          wrestlers: result.clearedWrestlers,
          players: result.clearedPlayers,
        }),
      );
      await loadWrestlers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('admin.manageWrestlers.resetError'),
      );
    } finally {
      setResettingAssignments(false);
    }
  };

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setImportResult(null);
    setImportParseErrors([]);
    setImportPreview(null);

    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    if (!file) return;

    try {
      const text = await file.text();
      const { rows, errors } = parseImportText(text, file.name);
      setImportPreview(rows);
      setImportParseErrors(errors);
    } catch (err) {
      setImportParseErrors([
        {
          row: 0,
          reason: `failed to read file: ${err instanceof Error ? err.message : 'unknown error'}`,
        },
      ]);
    }
  };

  const handleImportSubmit = async () => {
    if (!importPreview || importPreview.length === 0) {
      return;
    }
    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await wrestlersApi.importBulk(importPreview);
      setImportResult(result);
      await loadWrestlers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wrestlers');
    } finally {
      setImporting(false);
    }
  };

  const handleImportClose = () => {
    setShowImport(false);
    setImportFile(null);
    setImportPreview(null);
    setImportParseErrors([]);
    setImportResult(null);
  };

  const filteredWrestlers = wrestlers.filter((w) => {
    if (filter.promotion && w.promotion !== filter.promotion) return false;
    if (filter.onlyAvailable && w.isInUse) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredWrestlers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedWrestlers = filteredWrestlers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  return (
    <div className="manage-wrestlers">
      <div className="wrestlers-header">
        <h2>Manage Wrestlers</h2>
        <div className="wrestlers-header-actions">
          {!showAddForm && (
            <button className="am-fab" onClick={() => setShowAddForm(true)}>
              Create Wrestler
            </button>
          )}
          <button className="wrestlers-import-btn" onClick={() => setShowImport(true)}>
            Import from file
          </button>
          <button
            className="wrestlers-reset-assignments-btn"
            onClick={handleResetAssignments}
            disabled={resettingAssignments}
            title={t('admin.manageWrestlers.resetTitle')}
          >
            {resettingAssignments
              ? t('admin.manageWrestlers.resetting')
              : t('admin.manageWrestlers.resetAll')}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="wrestler-form-container am-sheet">
          <h3>{editingWrestler ? 'Edit Wrestler' : 'Create New Wrestler'}</h3>
          <form onSubmit={handleSubmit} className="wrestler-form am-form">
            <div className="form-group">
              <label htmlFor="promotion">Promotion</label>
              <select
                id="promotion"
                value={formData.promotion}
                onChange={(e) =>
                  setFormData({ ...formData, promotion: e.target.value as WrestlerPromotion })
                }
                required
              >
                {WRESTLER_PROMOTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                maxLength={128}
                placeholder="e.g., Cody Rhodes"
              />
            </div>

            <div className="form-group">
              <label htmlFor="overallCap">
                Overall Cap ({OVERALL_CAP_MIN}–{OVERALL_CAP_MAX})
              </label>
              <input
                type="number"
                id="overallCap"
                value={formData.overallCap}
                onChange={(e) =>
                  setFormData({ ...formData, overallCap: Number(e.target.value) })
                }
                min={OVERALL_CAP_MIN}
                max={OVERALL_CAP_MAX}
                step={1}
                required
              />
            </div>

            <div className="form-actions am-actionbar">
              <button type="submit">
                {editingWrestler ? 'Update Wrestler' : 'Create Wrestler'}
              </button>
              <button type="button" onClick={handleCancel} className="cancel-btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="wrestlers-filters">
        <div className="form-group am-filter-row">
          <label htmlFor="filter-promotion">Filter by Promotion</label>
          <select
            id="filter-promotion"
            value={filter.promotion}
            onChange={(e) => {
              setFilter({
                ...filter,
                promotion: e.target.value === '' ? '' : (e.target.value as WrestlerPromotion),
              });
              setPage(1);
            }}
          >
            <option value="">All promotions</option>
            {WRESTLER_PROMOTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <label className="wrestlers-filter-checkbox am-toggle-row">
          <input
            type="checkbox"
            className="am-toggle"
            checked={filter.onlyAvailable}
            onChange={(e) => {
              setFilter({ ...filter, onlyAvailable: e.target.checked });
              setPage(1);
            }}
          />
          Show only available
        </label>
      </div>

      <div className="wrestlers-list">
        <h3>
          All Wrestlers ({filteredWrestlers.length}
          {filteredWrestlers.length !== wrestlers.length ? ` of ${wrestlers.length}` : ''})
        </h3>
        {filteredWrestlers.length === 0 ? (
          <p>No wrestlers match the current filters.</p>
        ) : (
          <div className="wrestlers-table-wrapper">
            <table className="wrestlers-table am-card-table">
              <thead>
                <tr>
                  <th>Promotion</th>
                  <th>Name</th>
                  <th>Overall Cap</th>
                  <th>In Use</th>
                  <th>Assigned To</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedWrestlers.map((wrestler) => (
                  <tr key={wrestler.wrestlerId} className="am-list-row am-list-row-nomedia">
                    <td className="am-row-sub">{wrestler.promotion}</td>
                    <td className="am-row-title">{wrestler.name}</td>
                    <td className="am-row-badge wrestler-cap-cell">{wrestler.overallCap}</td>
                    <td className="am-row-badge2">
                      <span
                        className={
                          wrestler.isInUse
                            ? 'wrestler-status in-use'
                            : 'wrestler-status available'
                        }
                      >
                        {wrestler.isInUse ? 'In Use' : 'Available'}
                      </span>
                    </td>
                    <td className="am-row-extra">{wrestler.assignedPlayerId ?? '—'}</td>
                    <td className="am-row-actions am-row-actions-bottom">
                      <div className="wrestler-actions">
                        <button
                          onClick={() => handleEdit(wrestler)}
                          className="wrestler-edit-btn"
                        >
                          Edit
                        </button>
                        {wrestler.isInUse && (
                          <button
                            onClick={() => handleRelease(wrestler)}
                            className="wrestler-release-btn"
                            disabled={releasing === wrestler.wrestlerId}
                            title="Mark as available (does not currently un-assign from a player; P1 feature)"
                          >
                            {releasing === wrestler.wrestlerId ? 'Releasing...' : 'Release'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(wrestler.wrestlerId)}
                          className="wrestler-delete-btn"
                          disabled={
                            deleting === wrestler.wrestlerId || wrestler.isInUse
                          }
                          title={
                            wrestler.isInUse
                              ? 'Cannot delete a wrestler currently in use. Release first.'
                              : 'Delete wrestler'
                          }
                        >
                          {deleting === wrestler.wrestlerId ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="wrestlers-pager">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
            >
              {t('admin.manageWrestlers.pagePrev')}
            </button>
            <span className="wrestlers-pager-status">
              {t('admin.manageWrestlers.pageStatus', {
                page: safePage,
                total: totalPages,
              })}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage >= totalPages}
            >
              {t('admin.manageWrestlers.pageNext')}
            </button>
          </div>
        )}
      </div>

      {showImport && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleImportClose();
          }}
        >
          <div className="modal-content">
            <h3>Import Wrestlers</h3>
            <p className="import-help">
              Upload a <code>.json</code> or <code>.csv</code> file. CSV must have a header row
              with columns <code>promotion,name,overallCap</code>. JSON may be either a bare
              array or an object with a <code>wrestlers</code> array.
            </p>

            <div className="form-group">
              <label htmlFor="import-file">File</label>
              <input
                type="file"
                id="import-file"
                accept=".json,.csv,application/json,text/csv"
                onChange={handleImportFileChange}
              />
            </div>

            {importParseErrors.length > 0 && (
              <div className="error-message">
                <strong>Parse errors:</strong>
                <ul className="import-error-list">
                  {importParseErrors.slice(0, 10).map((err, idx) => (
                    <li key={idx}>
                      Row {err.row}: {err.reason}
                    </li>
                  ))}
                  {importParseErrors.length > 10 && (
                    <li>… and {importParseErrors.length - 10} more errors</li>
                  )}
                </ul>
              </div>
            )}

            {importPreview && importPreview.length > 0 && (
              <div className="import-preview">
                <h4>
                  Preview ({importPreview.length} row{importPreview.length === 1 ? '' : 's'}{' '}
                  valid)
                </h4>
                <table className="wrestlers-table">
                  <thead>
                    <tr>
                      <th>Promotion</th>
                      <th>Name</th>
                      <th>Overall Cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 5).map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.promotion}</td>
                        <td>{row.name}</td>
                        <td>{row.overallCap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 5 && (
                  <p className="import-more-note">
                    … and {importPreview.length - 5} more rows.
                  </p>
                )}
              </div>
            )}

            {importResult && (
              <div className="import-result">
                <h4>Import result</h4>
                <p>
                  <strong>Created:</strong> {importResult.created}
                </p>
                <p>
                  <strong>Skipped:</strong> {importResult.skipped}
                </p>
                {importResult.errors.length > 0 && (
                  <div>
                    <strong>Errors ({importResult.errors.length}):</strong>
                    <ul className="import-error-list">
                      {importResult.errors.slice(0, 10).map((err, idx) => (
                        <li key={idx}>
                          Row {err.row}: {err.reason}
                        </li>
                      ))}
                      {importResult.errors.length > 10 && (
                        <li>… and {importResult.errors.length - 10} more errors</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={
                  importing ||
                  !importPreview ||
                  importPreview.length === 0 ||
                  importResult !== null
                }
              >
                {importing
                  ? 'Importing...'
                  : `Import ${importPreview?.length ?? 0} wrestler${
                      (importPreview?.length ?? 0) === 1 ? '' : 's'
                    }`}
              </button>
              <button type="button" onClick={handleImportClose} className="cancel-btn">
                {importResult ? 'Close' : 'Cancel'}
              </button>
            </div>
            {importFile && (
              <p className="import-filename">
                Selected file: <code>{importFile.name}</code>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
