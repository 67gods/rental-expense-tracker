'use client';

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
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
  /** In the data but not shown until the user turns it on via "Columns". */
  defaultHidden?: boolean;
}

export interface Facet {
  key: string;
  label: string;
  /** The "no filter" option. Defaults to "All <label>". */
  allLabel?: string;
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
  /**
   * Extra controls for the row's action column - an Edit that opens a dialog,
   * most often.
   *
   * Rendered JSX rather than a render function, because the rows are built in a
   * server component and a function cannot cross into this one. Whatever the
   * page puts here is mounted per row, so it should be a small client component
   * with the row's own values already baked in.
   */
  actions?: ReactNode;
  /** Drawn in the leading star column. Only read when `onToggleStar` is given. */
  starred?: boolean;
  /** What the star's accessible label names, e.g. the job title. */
  starLabel?: string;
}

export function DataTable({
  id,
  rows,
  columns,
  facets = [],
  totals = [],
  searchPlaceholder = 'Search…',
  onDelete,
  onToggleStar,
  openLabel = 'Open',
}: {
  /** Distinguishes this table's remembered column choices from every other table's. */
  id: string;
  rows: DataRow[];
  columns: Column[];
  facets?: Facet[];
  totals?: TotalSpec[];
  searchPlaceholder?: string;
  /** A server action. Omitted when rows are not deletable from the list. */
  onDelete?: (id: string) => Promise<void>;
  /**
   * A server action. Given, every row gets a leading star that pins it.
   *
   * The NEXT value is passed rather than toggled inside, so two quick taps
   * cannot both read the same stale state.
   */
  onToggleStar?: (id: string, next: boolean) => Promise<void>;
  openLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [descending, setDescending] = useState(false);

  // Starts from each column's own default so server and first client render
  // agree; a saved choice (if any) is applied right after, in an effect.
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const storageKey = `cols:${id}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setHiddenKeys(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Corrupt or blocked storage - fall back to the column defaults already set.
    }
  }, [storageKey]);

  // WRITTEN FROM THE TOGGLE, not from an effect on `hiddenKeys`. An effect
  // would also fire on mount, before the load above has been applied, and
  // write the defaults back over the saved choice - it happened to correct
  // itself on the next render, which is the kind of accident that stops being
  // harmless the moment anything else reads the key in between.
  function persist(next: Set<string>) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Storage full or blocked. The choice still applies for this page.
    }
  }

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenKeys.has(c.key)),
    [columns, hiddenKeys],
  );

  // Not a state updater function: this writes to storage as well as to state,
  // and an updater has to stay pure - React calls it twice in development.
  function toggleColumn(key: string) {
    const next = new Set(hiddenKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      // A table with every column off is just an empty box. Counted from the
      // columns that actually exist, so a stale key left in storage by a
      // renamed column cannot make the last few look already hidden.
      const visibleNow = columns.filter((c) => !next.has(c.key)).length;
      if (visibleNow <= 1) return;
      next.add(key);
    }
    setHiddenKeys(next);
    persist(next);
  }

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

  // The trailing column exists if anything wants to live in it: a delete, or a
  // row that brought its own controls.
  const hasActs = Boolean(onDelete) || rows.some((row) => row.actions);

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
      {/*
        One row of controls, no visible labels.

        The labels used to sit above each control, which turned four filters
        into eight stacked elements and pushed the table itself below the fold.
        The placeholder and the "All …" default carry the same information in
        the space the control already occupies; each still has an aria-label,
        so nothing is lost to a screen reader.
      */}
      <div className="filters">
        <div className="search">
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <circle cx="6" cy="6" r="4.2" />
            <path d="M9.2 9.2 12.5 12.5" />
          </svg>
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search"
            autoComplete="off"
          />
        </div>

        {facets.map((facet) => (
          <select
            key={facet.key}
            className="select"
            aria-label={facet.label}
            value={chosen[facet.key] ?? ''}
            onChange={(event) =>
              setChosen((current) => ({ ...current, [facet.key]: event.target.value }))
            }
          >
            <option value="">{facet.allLabel ?? `All ${facet.label.toLowerCase()}`}</option>
            {(facetValues[facet.key] ?? []).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
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

        <details className="colmenu">
          <summary className="btn">Columns</summary>
          <div className="colmenu-panel">
            {columns.map((column) => (
              <label key={column.key} className="colmenu-item">
                <input
                  type="checkbox"
                  checked={!hiddenKeys.has(column.key)}
                  onChange={() => toggleColumn(column.key)}
                />
                {column.header}
              </label>
            ))}
          </div>
        </details>

        <span className="badge">
          <strong>{visible.length}</strong> shown
        </span>
      </div>

      {summary.length > 0 ? (
        <div className="strip mb-3">
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
                {onToggleStar ? <th className="star-cell" aria-label="Starred" /> : null}
                {visibleColumns.map((column) => {
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
                {hasActs ? <th className="acts-cell" aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  {onToggleStar ? (
                    <td className="star-cell">
                      <StarButton
                        starred={Boolean(row.starred)}
                        label={row.starLabel ?? 'this row'}
                        onToggle={async (next) => {
                          await onToggleStar(row.id, next);
                        }}
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((column) => (
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
                        ? row.badges.map((tag) => (
                            <span key={tag.label}>
                              {' '}
                              {tag.href ? (
                                <Link href={tag.href} className={`tag tag-${tag.tone}`}>
                                  {tag.label}
                                </Link>
                              ) : (
                                <span className={`tag tag-${tag.tone}`}>{tag.label}</span>
                              )}
                            </span>
                          ))
                        : null}
                    </td>
                  ))}
                  {hasActs ? (
                    <td className="acts-cell">
                      <span className="acts">
                        {/* Only alongside a delete. A table whose first column
                            is already a link to the row does not need a second
                            way in taking up the same space. */}
                        {onDelete && row.href ? (
                          <Link href={row.href} className="act">
                            {openLabel}
                          </Link>
                        ) : null}
                        {row.actions}
                        {onDelete ? (
                          <DeleteButton
                            variant="action"
                            what={row.deleteLabel ?? 'this record'}
                            onDelete={async () => {
                              await onDelete(row.id);
                            }}
                          />
                        ) : null}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      visibleColumns.length + (hasActs ? 1 : 0) + (onToggleStar ? 1 : 0)
                    }
                    className="muted"
                  >
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

/**
 * The pin, as a single tap.
 *
 * Optimistic: the star fills the moment it is clicked rather than after the
 * round trip, because a pin that lags feels broken and the failure case is a
 * revalidate putting it back. `aria-pressed` carries the state, so the label
 * stays "Star X" rather than changing under a screen reader mid-action.
 */
function StarButton({
  starred,
  label,
  onToggle,
}: {
  starred: boolean;
  label: string;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(starred);

  // The server is the authority again once it has answered - otherwise a failed
  // write would leave the star showing a state the database never took.
  useEffect(() => {
    setOptimistic(starred);
  }, [starred]);

  const on = pending ? optimistic : starred;

  return (
    <button
      type="button"
      className="star"
      aria-pressed={on}
      aria-label={`Star ${label}`}
      title={on ? 'Starred — click to unpin' : 'Star this to pin it to the top'}
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOptimistic(next);
        startTransition(async () => {
          await onToggle(next);
        });
      }}
    >
      {on ? '★' : '☆'}
    </button>
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
