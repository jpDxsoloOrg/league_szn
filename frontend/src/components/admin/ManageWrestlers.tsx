import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Upload } from 'lucide-react';
import { API_BASE_URL, fetchWithAuth, playersApi, wrestlersApi } from '../../services/api';
import type { WrestlerResetAssignmentsResult } from '../../services/api/wrestlers.api';
import {
  OVERALL_CAP_MAX,
  OVERALL_CAP_MIN,
  WRESTLER_PROMOTIONS,
  type Wrestler,
  type WrestlerImportResult,
  type WrestlerPromotion,
} from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import './adminRoster.css';
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

/** Must match RESET_ASSIGNMENTS_CONFIRM_TOKEN in the resetAssignments handler. */
const RESET_CONFIRM_TOKEN = 'RESET-ALL-ASSIGNMENTS';

const FORM_ID = 'wrestler-form';

type PendingAction = { kind: 'delete' | 'release'; wrestler: Wrestler };

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
  const [playerNames, setPlayerNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingWrestler, setEditingWrestler] = useState<Wrestler | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    // Names are a nicety on this page, so a failed lookup must not block it.
    const loadPlayerNames = async () => {
      try {
        const directory = await playersApi.getDirectory();
        setPlayerNames(new Map(directory.map((entry) => [entry.playerId, entry.name])));
      } catch (_err) {
        setPlayerNames(new Map());
      }
    };
    loadPlayerNames();
  }, []);

  const loadWrestlers = async () => {
    try {
      setLoading(true);
      const data = await wrestlersApi.getAll();
      setWrestlers(data);
    } catch (_err) {
      setError(t('adminRoster.wrestlers.loadError', 'Failed to load wrestlers'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(DEFAULT_FORM_DATA);
    setFormError(null);
    setShowAddForm(false);
    setEditingWrestler(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setError(null);
    setSuccess(null);

    const trimmedName = formData.name.trim();
    if (trimmedName.length === 0) {
      setFormError(t('adminRoster.wrestlers.nameRequired', 'Name is required'));
      return;
    }
    if (
      !Number.isInteger(formData.overallCap) ||
      formData.overallCap < OVERALL_CAP_MIN ||
      formData.overallCap > OVERALL_CAP_MAX
    ) {
      setFormError(t('adminRoster.wrestlers.capRange', {
        defaultValue: 'Overall Cap must be an integer between {{min}} and {{max}}',
        min: OVERALL_CAP_MIN,
        max: OVERALL_CAP_MAX,
      }));
      return;
    }

    try {
      if (editingWrestler) {
        await wrestlersApi.update(editingWrestler.wrestlerId, {
          promotion: formData.promotion,
          name: trimmedName,
          overallCap: formData.overallCap,
        });
        setSuccess(t('adminRoster.wrestlers.updated', 'Wrestler updated successfully!'));
      } else {
        await wrestlersApi.create({
          promotion: formData.promotion,
          name: trimmedName,
          overallCap: formData.overallCap,
        });
        setSuccess(t('adminRoster.wrestlers.created', 'Wrestler created successfully!'));
      }

      resetForm();
      await loadWrestlers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('adminRoster.wrestlers.saveError', 'Failed to save wrestler'));
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

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    const { kind, wrestler } = pendingAction;
    setActionBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (kind === 'delete') {
        await wrestlersApi.delete(wrestler.wrestlerId);
        setSuccess(t('adminRoster.wrestlers.deleted', 'Wrestler deleted successfully!'));
      } else {
        await wrestlersApi.update(wrestler.wrestlerId, { isInUse: false });
        setSuccess(t('adminRoster.wrestlers.released', 'Wrestler released successfully!'));
      }
      await loadWrestlers();
    } catch (err) {
      const fallback = kind === 'delete'
        ? t('adminRoster.wrestlers.deleteError', 'Failed to delete wrestler')
        : t('adminRoster.wrestlers.releaseError', 'Failed to release wrestler');
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setActionBusy(false);
      setPendingAction(null);
    }
  };

  const handleCancel = () => {
    resetForm();
  };

  const handleResetAssignments = async () => {
    const typedToken = window.prompt(
      `${t('admin.manageWrestlers.resetConfirm')}\n\n${t('admin.manageWrestlers.resetTypeToken', {
        token: RESET_CONFIRM_TOKEN,
      })}`,
    );
    if (typedToken === null) {
      return;
    }

    setError(null);
    setSuccess(null);

    if (typedToken.trim() !== RESET_CONFIRM_TOKEN) {
      setError(t('admin.manageWrestlers.resetTokenMismatch'));
      return;
    }

    setResettingAssignments(true);

    try {
      const result: WrestlerResetAssignmentsResult = await fetchWithAuth(
        `${API_BASE_URL}/wrestlers/reset-assignments`,
        { method: 'POST', body: JSON.stringify({ confirm: RESET_CONFIRM_TOKEN }) },
      );
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
      setError(err instanceof Error ? err.message : t('adminRoster.wrestlers.importError', 'Failed to import wrestlers'));
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

  const columns: DataTableColumn<Wrestler>[] = [
    {
      key: 'name',
      header: t('adminRoster.wrestlers.name', 'Name'),
      render: (wrestler) => <span className="ar-strong">{wrestler.name}</span>,
    },
    { key: 'promotion', header: t('adminRoster.wrestlers.promotion', 'Promotion'), render: (wrestler) => wrestler.promotion },
    {
      key: 'cap',
      header: t('adminRoster.wrestlers.overallCap', 'Overall Cap'),
      align: 'end',
      render: (wrestler) => <span className="ar-numeric">{wrestler.overallCap}</span>,
    },
    {
      key: 'status',
      header: t('adminRoster.wrestlers.status', 'Status'),
      render: (wrestler) => (
        <Badge tone={wrestler.isInUse ? 'warning' : 'win'}>
          {wrestler.isInUse
            ? t('adminRoster.wrestlers.inUse', 'In Use')
            : t('adminRoster.wrestlers.available', 'Available')}
        </Badge>
      ),
    },
    {
      key: 'assigned',
      header: t('adminRoster.wrestlers.assignedTo', 'Assigned To'),
      render: (wrestler) => {
        if (!wrestler.assignedPlayerId) return '—';
        return playerNames.get(wrestler.assignedPlayerId) ?? t('common.unknown', 'Unknown');
      },
    },
    {
      key: 'actions',
      header: t('common.actions', 'Actions'),
      align: 'end',
      render: (wrestler) => (
        <div className="ar-row-actions">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(wrestler)}>{t('common.edit', 'Edit')}</Button>
          {wrestler.isInUse && (
            <Button
              variant="ghost"
              size="sm"
              title={t('adminRoster.wrestlers.releaseHint', 'Mark as available and remove them from any player. A player left without a wrestler is hidden until they get a new one.')}
              onClick={() => setPendingAction({ kind: 'release', wrestler })}
            >
              {t('adminRoster.wrestlers.release', 'Release')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={wrestler.isInUse}
            title={wrestler.isInUse
              ? t('adminRoster.wrestlers.deleteBlocked', 'Cannot delete a wrestler currently in use. Release first.')
              : t('adminRoster.wrestlers.deleteHint', 'Delete wrestler')}
            onClick={() => setPendingAction({ kind: 'delete', wrestler })}
          >
            {t('common.delete', 'Delete')}
          </Button>
        </div>
      ),
    },
  ];

  const previewColumns: DataTableColumn<ParsedRow>[] = [
    { key: 'promotion', header: t('adminRoster.wrestlers.promotion', 'Promotion'), render: (row) => row.promotion },
    { key: 'name', header: t('adminRoster.wrestlers.name', 'Name'), render: (row) => row.name },
    { key: 'cap', header: t('adminRoster.wrestlers.overallCap', 'Overall Cap'), align: 'end', render: (row) => row.overallCap },
  ];

  const renderImportErrors = (errors: Array<{ row: number; reason: string }>) => (
    <ul className="ar-notice__list">
      {errors.slice(0, 10).map((err, idx) => (
        <li key={idx}>
          {t('adminRoster.wrestlers.importRow', { defaultValue: 'Row {{row}}', row: err.row })}: {err.reason}
        </li>
      ))}
      {errors.length > 10 && (
        <li>{t('adminRoster.wrestlers.importMoreErrors', { defaultValue: '… and {{count}} more errors', count: errors.length - 10 })}</li>
      )}
    </ul>
  );

  const importCount = importPreview?.length ?? 0;

  return (
    <div className="ar-page manage-wrestlers">
      <PageHeader
        title={t('adminRoster.wrestlers.title', 'Manage Wrestlers')}
        actions={(
          <>
            <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowAddForm(true)}>
              {t('adminRoster.wrestlers.create', 'Create Wrestler')}
            </Button>
            <Button variant="secondary" icon={<Upload aria-hidden="true" size={18} />} onClick={() => setShowImport(true)}>
              {t('adminRoster.wrestlers.importOpen', 'Import from file')}
            </Button>
            <Button
              variant="ghost"
              onClick={handleResetAssignments}
              disabled={resettingAssignments}
              title={t('admin.manageWrestlers.resetTitle')}
            >
              {resettingAssignments
                ? t('admin.manageWrestlers.resetting')
                : t('admin.manageWrestlers.resetAll')}
            </Button>
          </>
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <div className="ar-toolbar">
        <h2 className="ar-section-title">
          {t('adminRoster.wrestlers.all', 'All Wrestlers')} ({filteredWrestlers.length}
          {filteredWrestlers.length !== wrestlers.length ? ` ${t('adminRoster.of', 'of')} ${wrestlers.length}` : ''})
        </h2>
        <div className="ar-toolbar__filters wrestlers-filters">
          <Select
            label={t('adminRoster.wrestlers.filterPromotion', 'Filter by Promotion')}
            value={filter.promotion}
            onValueChange={(value) => {
              setFilter({ ...filter, promotion: value === '' ? '' : (value as WrestlerPromotion) });
              setPage(1);
            }}
            options={[
              { value: '', label: t('adminRoster.wrestlers.allPromotions', 'All promotions') },
              ...WRESTLER_PROMOTIONS.map((promotion) => ({ value: promotion, label: promotion })),
            ]}
          />
          <label className="ar-check">
            <input
              type="checkbox"
              checked={filter.onlyAvailable}
              onChange={(e) => {
                setFilter({ ...filter, onlyAvailable: e.target.checked });
                setPage(1);
              }}
            />
            {t('adminRoster.wrestlers.onlyAvailable', 'Show only available')}
          </label>
        </div>
      </div>

      <DataTable
        className="ar-table"
        caption={t('adminRoster.wrestlers.all', 'All Wrestlers')}
        density="dense"
        columns={columns}
        rows={pagedWrestlers}
        rowKey={(wrestler) => wrestler.wrestlerId}
        loading={loading}
        empty={<EmptyState title={t('adminRoster.wrestlers.noMatches', 'No wrestlers match the current filters.')} />}
      />

      {totalPages > 1 && (
        <div className="ar-pager">
          <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1}>
            {t('admin.manageWrestlers.pagePrev')}
          </Button>
          <span>{t('admin.manageWrestlers.pageStatus', { page: safePage, total: totalPages })}</span>
          <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages}>
            {t('admin.manageWrestlers.pageNext')}
          </Button>
        </div>
      )}

      <Modal
        open={showAddForm}
        onClose={handleCancel}
        title={editingWrestler
          ? t('adminRoster.wrestlers.editTitle', 'Edit Wrestler')
          : t('adminRoster.wrestlers.createTitle', 'Create New Wrestler')}
        footer={(
          <>
            <Button variant="ghost" onClick={handleCancel}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" form={FORM_ID}>
              {editingWrestler
                ? t('adminRoster.wrestlers.update', 'Update Wrestler')
                : t('adminRoster.wrestlers.create', 'Create Wrestler')}
            </Button>
          </>
        )}
      >
        <form id={FORM_ID} onSubmit={handleSubmit} className="ar-form">
          {formError && <AdminNotice tone="error">{formError}</AdminNotice>}
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="promotion">{t('adminRoster.wrestlers.promotion', 'Promotion')}</label>
            <select
              className="ar-input"
              id="promotion"
              value={formData.promotion}
              onChange={(e) => setFormData({ ...formData, promotion: e.target.value as WrestlerPromotion })}
              required
            >
              {WRESTLER_PROMOTIONS.map((promotion) => (
                <option key={promotion} value={promotion}>{promotion}</option>
              ))}
            </select>
          </div>
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="wrestler-name">{t('adminRoster.wrestlers.name', 'Name')}</label>
            <input
              className="ar-input"
              type="text"
              id="wrestler-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              maxLength={128}
              placeholder={t('adminRoster.wrestlers.namePlaceholder', 'e.g., Cody Rhodes')}
            />
          </div>
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="overallCap">
              {t('adminRoster.wrestlers.overallCap', 'Overall Cap')} ({OVERALL_CAP_MIN}–{OVERALL_CAP_MAX})
            </label>
            <input
              className="ar-input"
              type="number"
              id="overallCap"
              value={formData.overallCap}
              onChange={(e) => setFormData({ ...formData, overallCap: Number(e.target.value) })}
              min={OVERALL_CAP_MIN}
              max={OVERALL_CAP_MAX}
              step={1}
              required
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={showImport}
        onClose={handleImportClose}
        size="lg"
        title={t('adminRoster.wrestlers.importTitle', 'Import Wrestlers')}
        footer={(
          <>
            <Button variant="ghost" onClick={handleImportClose}>
              {importResult ? t('common.close', 'Close') : t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleImportSubmit}
              loading={importing}
              disabled={!importPreview || importPreview.length === 0 || importResult !== null}
            >
              {t('adminRoster.wrestlers.importSubmit', { defaultValue: 'Import {{count}} wrestlers', count: importCount })}
            </Button>
          </>
        )}
      >
        <div className="ar-form">
          <p className="ar-hint">
            {t('adminRoster.wrestlers.importHelp', 'Upload a .json or .csv file. CSV needs a header row with promotion, name, overallCap. JSON may be an array or an object with a wrestlers array.')}
          </p>

          <div className="ar-field">
            <label className="ar-field__label" htmlFor="import-file">{t('adminRoster.wrestlers.importFile', 'File')}</label>
            <input
              className="ar-input"
              type="file"
              id="import-file"
              accept=".json,.csv,application/json,text/csv"
              onChange={handleImportFileChange}
            />
            {importFile && <p className="ar-hint">{importFile.name}</p>}
          </div>

          {importParseErrors.length > 0 && (
            <AdminNotice tone="error">
              <strong>{t('adminRoster.wrestlers.parseErrors', 'Parse errors')}</strong>
              {renderImportErrors(importParseErrors)}
            </AdminNotice>
          )}

          {importPreview && importPreview.length > 0 && (
            <div className="ar-form">
              <h3 className="ar-section-title">
                {t('adminRoster.wrestlers.importPreview', { defaultValue: 'Preview ({{count}} valid rows)', count: importPreview.length })}
              </h3>
              <DataTable
                caption={t('adminRoster.wrestlers.importTitle', 'Import Wrestlers')}
                density="dense"
                columns={previewColumns}
                rows={importPreview.slice(0, 5)}
                rowKey={(row) => String(importPreview.indexOf(row))}
              />
              {importPreview.length > 5 && (
                <p className="ar-hint">
                  {t('adminRoster.wrestlers.importMoreRows', { defaultValue: '… and {{count}} more rows.', count: importPreview.length - 5 })}
                </p>
              )}
            </div>
          )}

          {importResult && (
            <AdminNotice tone={importResult.errors.length > 0 ? 'warning' : 'success'}>
              <strong>{t('adminRoster.wrestlers.importResult', 'Import result')}</strong>
              <p>{t('adminRoster.wrestlers.importCreated', 'Created')}: {importResult.created}</p>
              <p>{t('adminRoster.wrestlers.importSkipped', 'Skipped')}: {importResult.skipped}</p>
              {importResult.errors.length > 0 && renderImportErrors(importResult.errors)}
            </AdminNotice>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={pendingAction !== null}
        title={pendingAction?.kind === 'release'
          ? t('adminRoster.wrestlers.releaseTitle', 'Release wrestler')
          : t('adminRoster.wrestlers.deleteTitle', 'Delete wrestler')}
        message={pendingAction?.kind === 'release'
          ? t('adminRoster.wrestlers.releaseConfirm', {
            defaultValue: 'Release "{{name}}"? They will be marked as available and removed from any player. A player left without a wrestler is hidden until they get a new one.',
            name: pendingAction.wrestler.name,
          })
          : t('adminRoster.wrestlers.deleteConfirm', 'Are you sure you want to delete this wrestler?')}
        confirmLabel={pendingAction?.kind === 'release'
          ? t('adminRoster.wrestlers.release', 'Release')
          : t('common.delete', 'Delete')}
        busy={actionBusy}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
