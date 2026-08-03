'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@rental/domain';
import { DeleteButton } from './DeleteButton';

/**
 * The table that replaces the spreadsheet.
 *
 * This app asks someone to give up Excel, and Excel gives you sort, filter and
 * search for free. Without them a review screen is a printout: you can read it
 * and you cannot ask it anything. Nothing about the earlier tables let you say
 * "show me Westmill repairs over $500", which is the first question anybody
 * actually has.
 *
 * Everything happens in memory on rows already sent to the page. A year is
 * eighty-odd expenses, so filtering is instant and there is no round trip -
 * which is the whole feel of a spreadsheet and is lost the moment a sort click
 * costs a page load.
 *
 * THE TOTALS FOLLOW THE FILTER. That is the point, not a detail: filter to one
 * property and the sum is that property's, exactly as selecting a range in
 * Excel would show it. A total that ignored the filter would be worse than no
 * total, because it would look like an answer to the question just asked.
 */

export interface Column {
  key: string;
  header: string;
  /** Right-aligned and monospaced. Sorts numerically. */
  numeric?: boolean;
  /** Keeps the cell on one line - dates, short codes. */
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
  /** Format as money. Otherwise shown as a plain number. */
  money?: boolean;
  /** Show a count of rows rather than a sum. */
  count?: boolean;
}

export interface Badge {
  label: string;
  tone: 'eligible' | 'flag' | 'muted';
  href?: string;
}

export interface DataRow {
  id: string;
  /** Display text per column key. */
  cells: Record<string, string>;
  /** Sort keys per column key. Numbers sort numerically, strings by locale. */
  sort: Record<string, string | number>;
  /** Values the totals strip sums. */
  numeric?: Record<string, number>;
  /** Lowercased haystack for the search box. */
  search: string;
  href?: string;
  badges?: Badge[];
  /** Set when a numeric cell should stand out - invoiced not equal to paid. */
  highlight?: string[];
  /**
   * What the delete confirmation names, e.g. "the $430.00 expense from
   * Cleaning services".
   *
   * Carried per row rather than built by a callback prop: a plain function
   * cannot cross into a client component, and the alternative - passing the
   * whole row back to the server to be described - is a round trip to produce
   * a string the server already had.
   */
  deleteLabel?: string;
}

export function DataTable({
  rows,
  columns,
  facets = [],
  totals = [],
  searchPlaceholder = 'Search…',
  onDelete,
  emptyMessage = 'Nothing matches those filters.',
}: {
  rows: DataRow[];
  columns: Column[];
  facets?: Facet[];
  totals?: TotalSpec[];
  searchPlaceholder?: string;
  /** A server action. Omitted when rows are not deletable from the list. */
  onDelete?: (id: string) => Promise<void>;
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [descending, setDescending] = useState(false);

  // Built from the rows themselves rather than passed in, so a facet can never
  // offer a value that is not present or miss one that is.
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
    // a re-render and make the order depend on how many times you clicked.
    return [...filtered].sort((a, b) => {
      const left = a.sort[sortKey];
      const right = b.sort[sortKey];
      let result: number;
      if (typeof left === 'number' && typeof right === 'number') {
        result = left - right;
      } else {
        result = String(left ?? '').localeCompare(String(right ?? ''));
      }
      return descending ? -result : result;
    });
  }, [rows, query, chosen, sortKey, descending]);

  const summary = useMemo(() => {
    return totals.map((total) => {
      if (total.count) return { label: total.label, value: String(visible.length) };
      const sum = visible.reduce((acc, row) => acc + (row.numeric?.[total.key] ?? 0), 0);
      return {
        label: total.label,
        value: total.money ? formatCents(sum) : sum.toFixed(1),
      };
    });
  }, [visible, totals]);

  const isFiltered = query.trim() !== '' || Object.values(chosen).some(Boolean);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setDescending((d) => !d);
    } else {
      setSortKey(key);
      setDescending(false);
    }
  }

  return (
    <div className="grid gap-3">
      {/* Controls first: the question comes before the answer. */}
      <div className="card card-pad grid gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="field min-w-[12rem] flex-1">
            <span className="label">Search</span>
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
            <label key={facet.key} className="field min-w-[9rem]">
              <span className="label">{facet.label}</span>
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
              className="btn btn-ghost"
              onClick={() => {
                setQuery('');
                setChosen({});
              }}
            >
              Clear
            </button>
          ) : null}
        </div>

        {totals.length > 0 ? (
          <dl className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-[color:var(--color-muted)]">{item.label}</dt>
                <dd className="tnum text-base font-semibold">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {isFiltered ? (
          <p className="hint">
            Showing {visible.length} of {rows.length}. The totals above are for what is showing.
          </p>
        ) : null}
      </div>

      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sortKey === column.key;
                return (
                  <th key={column.key} className={column.numeric ? 'num' : undefined}>
                    <button
                      type="button"
                      className="cursor-pointer bg-transparent p-0 font-inherit"
                      onClick={() => toggleSort(column.key)}
                      // The arrow only appears on the active column, so the
                      // header row does not read as a row of controls.
                      aria-label={`Sort by ${column.header}`}
                    >
                      {column.header}
                      {active ? (descending ? ' ↓' : ' ↑') : ''}
                    </button>
                  </th>
                );
              })}
              {onDelete ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      column.numeric ? 'num' : '',
                      column.nowrap ? 'whitespace-nowrap' : '',
                      row.highlight?.includes(column.key)
                        ? 'font-semibold text-[color:var(--color-flag-700)]'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {column.isLink && row.href ? (
                      <Link href={row.href}>{row.cells[column.key]}</Link>
                    ) : (
                      row.cells[column.key]
                    )}
                    {column.isLink && row.badges?.length
                      ? row.badges.map((badge) => (
                          <span key={badge.label}> {renderBadge(badge)}</span>
                        ))
                      : null}
                  </td>
                ))}
                {onDelete ? (
                  <td className="whitespace-nowrap">
                    {row.href ? (
                      <Link href={row.href} className="btn btn-ghost text-xs">
                        Open
                      </Link>
                    ) : null}
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
                <td colSpan={columns.length + (onDelete ? 1 : 0)} className="hint">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderBadge(badge: Badge) {
  const className =
    badge.tone === 'eligible'
      ? 'badge badge-eligible'
      : badge.tone === 'flag'
        ? 'badge badge-flag'
        : 'badge badge-not-eligible';
  return badge.href ? (
    <Link href={badge.href} className={className}>
      {badge.label}
    </Link>
  ) : (
    <span className={className}>{badge.label}</span>
  );
}
