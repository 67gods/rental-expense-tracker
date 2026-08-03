'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@rental/domain';
import { DeleteButton } from '@/components/DeleteButton';

/**
 * The table that replaces the spreadsheet.
 *
 * This app asks someone to give up Excel, and Excel gives sort, filter and
 * search for free. Without them a review screen is a printout: you can read it
 * and you cannot ask it anything.
 *
 * Everything happens in memory on rows already sent to the page. A year is
 * eighty-odd expenses, so filtering is instant - and the spreadsheet feel dies
 * the moment a sort click costs a page load.
 *
 * THE TOTALS FOLLOW THE FILTER. That is the point rather than a detail: filter
 * to one property and the sum is that property's, exactly as selecting a range
 * in Excel would show it. A total that ignored the filter would be worse than
 * none, because it would look like an answer to the question just asked.
 */

export interface Column {
  key: string;
  header: string;
  /** Right-aligned, monospaced, sorted numerically. */
  numeric?: boolean;
  nowrap?: boolean;
  /** Renders the cell as a link to the row's href. */
  isLink?: boolean;
}

export interface Facet {
  key: string;
  label: string;
}

export interface TotalSpec {
  key: string;
  label: string;
  money?: boolean;
  count?: boolean;
}

export interface Badge {
  label: string;
  tone: 'pos' | 'warn' | 'neg' | 'capital' | 'info' | 'muted';
  href?: string;
}

export interface DataRow {
  id: string;
  cells: Record<string, string>;
  /** Separate from display text: "1h 30m" must sort on 90, not on the "1". */
  sort: Record<string, string | number>;
  numeric?: Record<string, number>;
  /** Lowercased haystack for the search box. */
  search: string;
  href?: string;
  badges?: Badge[];
  /** Column keys to highlight - invoiced not equal to paid. */
  highlight?: string[];
  /** What the delete confirmation names. Carried per row: a function cannot
      cross into a client component, and the server already had the string. */
  deleteLabel?: string;
}

export function DataTable({
  rows,
  columns,
  facets = [],
  totals = [],
  searchPlaceholder = 'Search…',
  onDelete,
  openLabel = 'Open',
}: {
  rows: DataRow[];
  columns: Column[];
  facets?: Facet[];
  totals?: TotalSpec[];
  searchPlaceholder?: string;
  /** A server action. Omitted when rows are not deletable from the list. */
  onDelete?: (id: string) => Promise<void>;
  openLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [descending, setDescending] = useState(false);

  // Built from the rows themselves, so a facet can never offer a value that is
  // absent or miss one that is present.
  const facetValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const facet of facets) {
      const seen = new Set<string>();
      for (const row of rows) {
        const value = row.cells[facet.key];
        if (value) seen.add(value);
      }
      out[facet.key] = [...seen].sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [rows, facets]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      if (needle && !row.search.includes(needle)) return false;
      for (const [key, value] of Object.entries(chosen)) {
        if (value && row.cells[key] !== value) return false;
      }
      return true;
    });

    if (!sortKey) return filtered;

    // Sorted on a copy: mutating the prop would reorder the server's array on
    // re-render and make the order depend on how many times you clicked.
    return [...filtered].sort((a, b) => {
      const left = a.sort[sortKey];
      const right = b.sort[sortKey];
      const result =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left ?? '').localeCompare(String(right ?? ''));
      return descending ? -result : result;
    });
  }, [rows, query, chosen, sortKey, descending]);

  const summary = useMemo(
    () =>
      totals.map((total) => {
        if (total.count) return { label: total.label, value: String(visible.length) };
        const sum = visible.reduce((acc, row) => acc + (row.numeric?.[total.key] ?? 0), 0);
        return {
          label: total.label,
          value: total.money ? formatCents(sum) : sum.toFixed(1),
        };
      }),
    [visible, totals],
  );

  const isFiltered = query.trim() !== '' || Object.values(chosen).some(Boolean);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setDescending((value) => !value);
    } else {
      setSortKey(key);
      setDescending(false);
    }
  }

  return (
    <>
      <div className="filters">
        <label className="field filter-search">
          <span className="field-label">Search</span>
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
          />
        </label>

        {facets.map((facet) => (
          <label className="field" key={facet.key}>
            <span className="field-label">{facet.label}</span>
            <select
              className="select"
              value={chosen[facet.key] ?? ''}
              onChange={(event) =>
                setChosen((current) => ({ ...current, [facet.key]: event.target.value }))
              }
            >
              <option value="">All</option>
              {(facetValues[facet.key] ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}

        {isFiltered ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setQuery('');
              setChosen({});
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {summary.length > 0 ? (
        <div className="strip" style={{ marginBottom: 12 }}>
          {summary.map((item) => (
            <div className="strip-cell" key={item.label}>
              <div className="strip-key">{item.label}</div>
              <div className="strip-value">{item.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="tablebox">
        <div className="tablescroll">
          <table className="table">
            <thead>
              <tr>
                {columns.map((column) => {
                  const active = sortKey === column.key;
                  return (
                    <th
                      key={column.key}
                      className={column.numeric ? 'num' : undefined}
                      aria-sort={
                        active ? (descending ? 'descending' : 'ascending') : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="table-sort"
                        data-sorted={active}
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.header}
                        {active ? (descending ? ' ↓' : ' ↑') : ''}
                      </button>
                    </th>
                  );
                })}
                {onDelete ? <th aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cellClass(column, row)}
                    >
                      {column.isLink && row.href ? (
                        <Link href={row.href}>{row.cells[column.key]}</Link>
                      ) : (
                        row.cells[column.key]
                      )}
                      {column.isLink && row.badges?.length
                        ? row.badges.map((badge) => (
                            <span key={badge.label}>
                              {' '}
                              {badge.href ? (
                                <Link href={badge.href} className={`tag tag-${badge.tone}`}>
                                  {badge.label}
                                </Link>
                              ) : (
                                <span className={`tag tag-${badge.tone}`}>{badge.label}</span>
                              )}
                            </span>
                          ))
                        : null}
                    </td>
                  ))}
                  {onDelete ? (
                    <td className="nowrap num">
                      {row.href ? (
                        <Link href={row.href} className="btn">
                          {openLabel}
                        </Link>
                      ) : null}{' '}
                      <DeleteButton
                        what={row.deleteLabel ?? 'this record'}
                        onDelete={async () => {
                          await onDelete(row.id);
                        }}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (onDelete ? 1 : 0)} className="muted">
                    Nothing matches those filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className="hint">
        {isFiltered
          ? `Showing ${visible.length} of ${rows.length}. The totals above are for what is showing.`
          : `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}. Click a column to sort.`}
      </p>
    </>
  );
}

function cellClass(column: Column, row: DataRow): string | undefined {
  const parts = [
    column.numeric ? 'num' : '',
    column.nowrap ? 'nowrap' : '',
    row.highlight?.includes(column.key) ? 'warn' : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}
