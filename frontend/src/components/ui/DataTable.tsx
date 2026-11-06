import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Names the table for screen readers. */
  caption: string;
  /** `dense` is the 15px admin table. */
  density?: 'default' | 'dense';
  loading?: boolean;
  /** Shown in place of the table when there are no rows. */
  empty?: ReactNode;
  className?: string;
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
 * column headers as labels, so keep public tables to about six columns.
 */
export default function DataTable<Row>({ columns, rows, rowKey, caption, density = 'default', loading = false, empty, className = '' }: DataTableProps<Row>) {
  const [sort, setSort] = useState<SortState | null>(null);

  const sortedRows = useMemo(() => {
    const getValue = columns.find((column) => column.key === sort?.key)?.sortValue;
    if (!sort || !getValue) return rows;
    const factor = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((first, second) => factor * compareValues(getValue(first), getValue(second)));
  }, [columns, rows, sort]);

  if (loading) return <Skeleton variant="table" className={className} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  const toggleSort = (key: string) => {
    setSort((previous) => ({
      key,
      direction: previous?.key === key && previous.direction === 'ascending' ? 'descending' : 'ascending',
    }));
  };

  return (
    <div className={`ui-table-wrap ui-table-wrap--${density} ${className}`.trim()}>
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
          {sortedRows.map((row) => (
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
    </div>
  );
}
