import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import Button from './Button';
import Select from './Select';
import Skeleton from './Skeleton';
import './DataTable.css';

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Enables sorting on this column. */
  sortValue?: (row: Row) => string | number;
  /** Leaves the column out of the phone card layout. */
  hideOnMobile?: boolean;
}

export interface DataTablePagination {
  /** Zero-based page shown. Clamped to the last page. */
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Renders only this many rows. Applied after sorting, so a sort still covers every row. */
  rowLimit?: number;
  rowKey: (row: Row) => string;
  /** Names the table for screen readers. */
  caption: string;
  /** `dense` is the 15px admin table. */
  density?: 'default' | 'dense';
  loading?: boolean;
  /** Shown in place of the table when there are no rows. */
  empty?: ReactNode;
  className?: string;
  /** Shows one page at a time, after sorting, with a pager under the table. */
  pagination?: DataTablePagination;
}

interface SortState {
  key: string;
  direction: 'ascending' | 'descending';
}

function compareValues(first: string | number, second: string | number): number {
  if (typeof first === 'number' && typeof second === 'number') return first - second;
  return String(first).localeCompare(String(second));
}

/**
 * Responsive table. At phone widths each row becomes a stacked card with
 * column headers as labels, so keep public tables to about six columns. The
 * header row is not on screen there, so a Select takes over sorting.
 */
export default function DataTable<Row>({ columns, rows, rowLimit, rowKey, caption, density = 'default', loading = false, empty, className = '', pagination }: DataTableProps<Row>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [sort, setSort] = useState<SortState | null>(null);

  const sortedRows = useMemo(() => {
    const getValue = columns.find((column) => column.key === sort?.key)?.sortValue;
    if (!sort || !getValue) return rows;
    const factor = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((first, second) => factor * compareValues(getValue(first), getValue(second)));
  }, [columns, rows, sort]);

  if (loading) return <Skeleton variant="table" className={className} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  const pageCount = pagination ? Math.max(1, Math.ceil(sortedRows.length / pagination.pageSize)) : 1;
  const page = pagination ? Math.min(Math.max(pagination.page, 0), pageCount - 1) : 0;
  const pageStart = pagination ? page * pagination.pageSize : 0;
  const limitedRows = rowLimit === undefined ? sortedRows : sortedRows.slice(0, rowLimit);
  const shownRows = pagination ? limitedRows.slice(pageStart, pageStart + pagination.pageSize) : limitedRows;

  const toggleSort = (key: string) => {
    // A new order starts from its first page.
    pagination?.onPageChange(0);
    setSort((previous) => ({
      key,
      direction: previous?.key === key && previous.direction === 'ascending' ? 'descending' : 'ascending',
    }));
  };

  // Columns the cards leave out are not offered: a phone user could not see
  // what the rows were being ordered by.
  const sortOptions = columns.filter((column) => column.sortValue && !column.hideOnMobile).flatMap((column) => [
    { value: `${column.key}:ascending`, label: t('common.sortAscending', { column: column.header }) },
    { value: `${column.key}:descending`, label: t('common.sortDescending', { column: column.header }) },
  ]);

  const applySort = (value: string) => {
    pagination?.onPageChange(0);
    const separator = value.lastIndexOf(':');
    if (separator < 0) {
      setSort(null);
      return;
    }
    const direction = value.slice(separator + 1) === 'descending' ? 'descending' : 'ascending';
    setSort({ key: value.slice(0, separator), direction });
  };

  return (
    <div className={`ui-table-wrap ui-table-wrap--${density} ${className}`.trim()}>
      {isMobile && sortOptions.length > 0 && (
        <div className="ui-table__card-sort">
          <span aria-hidden="true">{t('common.sortBy')}</span>
          <Select
            className="ui-table__card-sort-select"
            label={t('common.sortBy')}
            value={sort ? `${sort.key}:${sort.direction}` : ''}
            onValueChange={applySort}
            options={[{ value: '', label: t('common.sortDefault') }, ...sortOptions]}
          />
        </div>
      )}
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort?.key === column.key ? sort.direction : undefined;
              return (
                <th key={column.key} scope="col" aria-sort={sorted} className={`ui-table__cell--${column.align ?? 'start'}`}>
                  {column.sortValue ? (
                    <button type="button" className="ui-table__sort" onClick={() => toggleSort(column.key)}>
                      {column.header}
                      {sorted === 'ascending' && <ChevronUp aria-hidden="true" size={14} />}
                      {sorted === 'descending' && <ChevronDown aria-hidden="true" size={14} />}
                    </button>
                  ) : column.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shownRows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  className={[
                    `ui-table__cell--${column.align ?? 'start'}`,
                    column.hideOnMobile ? 'ui-table__cell--desktop-only' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && pageCount > 1 && (
        <nav className="ui-table__pager" aria-label={t('common.pagination', 'Pages')}>
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => pagination.onPageChange(page - 1)}>
            {t('common.previous', 'Previous')}
          </Button>
          <span className="ui-table__pager-status" aria-live="polite">
            {t('common.pageStatus', {
              defaultValue: 'Page {{page}} of {{pages}} · {{from}}–{{to}} of {{total}}',
              page: page + 1,
              pages: pageCount,
              from: pageStart + 1,
              to: pageStart + shownRows.length,
              total: limitedRows.length,
            })}
          </span>
          <Button variant="ghost" size="sm" disabled={page >= pageCount - 1} onClick={() => pagination.onPageChange(page + 1)}>
            {t('common.next', 'Next')}
          </Button>
        </nav>
      )}
    </div>
  );
}
