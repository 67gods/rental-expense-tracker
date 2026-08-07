import Link from 'next/link';

/**
 * The Ledger primitives.
 *
 * Nine shapes carry the whole product. Anything a page needs beyond these is a
 * signal to extend one rather than write a page-specific block of markup -
 * which is how the previous UI ended up with 314 hand-written class
 * combinations and no way to change anything globally.
 *
 * All of them are server components taking plain serialisable props, so a page
 * doing database work can render them without crossing a client boundary.
 */

/* ---------------------------------------------------------------- Page ---- */

/**
 * The content well.
 *
 * Every page body is wrapped in one, so padding and max width are decided in
 * exactly one place. `PageHeader` sits outside it because the header is sticky
 * and the well scrolls under it.
 */
export function Well({ children }: { children: React.ReactNode }) {
  return <div className="well">{children}</div>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title">{children}</h2>;
}

/* ---------------------------------------------------------------- Stats --- */

export interface Stat {
  key: string;
  label: string;
  value: string;
  /** Small line under the figure - a count, a qualifier, a date. */
  sub?: string;
  tone?: 'pos' | 'neg' | 'warn' | 'capital';
}

/**
 * The joined row of headline figures.
 *
 * One border around the group with hairlines between, rather than separate
 * cards - these numbers are read together and gaps between cards make them
 * look like unrelated facts.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="strip">
      {stats.map((stat) => (
        <div className="strip-cell" key={stat.key}>
          <div className="strip-key">{stat.label}</div>
          <div className={stat.tone ? `strip-value ${stat.tone}` : 'strip-value'}>
            {stat.value}
          </div>
          {stat.sub ? <div className="strip-sub">{stat.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Panels --- */

export function Panel({
  title,
  aside,
  children,
  bodyless,
}: {
  title?: string;
  /** Right-aligned content in the panel head - a count, a link. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  /** Set when the child is a table, which brings its own padding. */
  bodyless?: boolean;
}) {
  return (
    <section className="panel">
      {title ? (
        <div className="panel-head">
          <span>{title}</span>
          {aside ? <span className="ml-auto">{aside}</span> : null}
        </div>
      ) : null}
      {bodyless ? children : <div className="panel-body">{children}</div>}
    </section>
  );
}

export interface KeyValueRow {
  key: string;
  label: string;
  value: React.ReactNode;
  tone?: 'pos' | 'neg' | 'warn' | 'muted';
}

/**
 * Label/value rows.
 *
 * A `dl` rather than a table because these are facts about one thing, not rows
 * of comparable records - and a screen reader should announce them that way.
 */
export function KeyValues({ rows }: { rows: KeyValueRow[] }) {
  return (
    <dl>
      {rows.map((row) => (
        <div className="kv" key={row.key}>
          <dt>{row.label}</dt>
          <dd className={row.tone === 'muted' ? 'muted' : row.tone}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------- Tags --- */

export type TagTone = 'pos' | 'warn' | 'neg' | 'capital' | 'info' | 'muted';

/**
 * A status label.
 *
 * Six tones, each with one meaning, because a palette where colour is
 * decorative teaches people to ignore it: pos is a check that passed, warn is
 * a decision waiting on the owner, capital is basis rather than a deduction,
 * neg is a loss or a refusal, info is a neutral link, muted is a fact.
 */
export function Tag({
  tone = 'muted',
  href,
  children,
}: {
  tone?: TagTone;
  href?: string;
  children: React.ReactNode;
}) {
  const className = `tag tag-${tone}`;
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

/* ---------------------------------------------------------------- Notes --- */

/**
 * An explanation attached to what it explains.
 *
 * These carry the reasoning that would otherwise live only in a commit message
 * - why capital sits outside the net, why a blank 1099 is not a zero. The tone
 * follows the same meaning as tags.
 */
export function Note({
  tone,
  children,
}: {
  tone?: 'warn' | 'pos';
  children: React.ReactNode;
}) {
  return <p className={tone ? `note note-${tone}` : 'note'}>{children}</p>;
}

/* ---------------------------------------------------------------- Table --- */

export function TableBox({
  children,
  variant,
}: {
  children: React.ReactNode;
  /**
   * `ledger` turns the table on its side: the operator gutter, the section
   * bands and the subtotal rules that make a column of figures add up. Used by
   * the per-property calculation on the overview.
   */
  variant?: 'ledger';
}) {
  return (
    <div className="tablebox">
      <div className="tablescroll">
        <table className={variant ? `table table-${variant}` : 'table'}>{children}</table>
      </div>
    </div>
  );
}

/**
 * A label that can explain itself.
 *
 * Extracted from `Th` because the explanation belongs wherever the figure is
 * named, and on the ledger table that is a row label rather than a column
 * header. "Deductible $14,897.52" is unanswerable without one - paid or
 * invoiced, depreciation in or out, does this property's share of the
 * portfolio software count - and each of those questions changes the number.
 *
 * CSS-only rather than a popover, so this stays a server component and a table
 * of a dozen of them ships no event handlers. `tabIndex` puts it on the
 * keyboard path, because the person who does not already know what a row means
 * is as likely to be tabbing as pointing.
 */
export function Tip({ body, children }: { body: string; children: React.ReactNode }) {
  return (
    <span className="tip" tabIndex={0} role="note">
      {children}
      <i className="tip-mark" aria-hidden="true">
        ?
      </i>
      <span className="tip-body">{body}</span>
    </span>
  );
}

/**
 * A column header that can explain itself.
 *
 * A money column headed "Deductible" is only readable by someone who already
 * knows whether that means invoiced or paid, whether depreciation is in it, and
 * whether a share of a portfolio-wide cost counts. Everyone else guesses, and a
 * guess about a tax figure is worse than no figure.
 *
 * CSS-only rather than a popover component, so this stays a server component
 * and a table of eight headers does not ship eight event handlers. The text is
 * in `aria-describedby`-shaped markup - a visually hidden span the tooltip is
 * drawn from - so a screen reader gets the same sentence a mouse does, and
 * `tabIndex` puts it on the keyboard path.
 */
export function Th({
  tip,
  numeric,
  nowrap,
  children,
}: {
  /** One or two sentences. Longer than that belongs in a Note under the table. */
  tip?: string;
  numeric?: boolean;
  nowrap?: boolean;
  children: React.ReactNode;
}) {
  const className = [numeric ? 'num' : '', nowrap ? 'nowrap' : ''].filter(Boolean).join(' ');

  if (!tip) return <th className={className || undefined}>{children}</th>;

  return (
    <th className={className || undefined}>
      <Tip body={tip}>{children}</Tip>
    </th>
  );
}

/** Shown in place of a table when a year genuinely holds nothing. */
export function Empty({
  what,
  year,
  action,
}: {
  what: string;
  year?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="empty">
        <p>
          No {what}
          {year === undefined ? '' : ` in ${year}`}.
        </p>
        {/* Said out loud because nobody guesses it: the year switcher, not the
            data, is the usual reason a loaded year looks empty. */}
        {year === undefined ? null : (
          <p className="hint mx-auto mt-2 max-w-[420px]">
            Records live in the year they happened, not the year you are signed
            in to. Check the year in the rail if you were expecting some.
          </p>
        )}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Bar --- */

/**
 * A proportional bar with a legend.
 *
 * The only place inline styles are legitimate: the widths are data, and a
 * class per possible percentage would be absurd.
 */
export function SplitBar({
  parts,
}: {
  parts: { key: string; label: string; pct: number; color: string }[];
}) {
  return (
    <>
      <div className="bar">
        {parts.map((part) => (
          <span key={part.key} style={{ width: `${part.pct}%`, background: part.color }} />
        ))}
      </div>
      <div className="legend">
        {parts.map((part) => (
          <span key={part.key}>
            <i className="legend-dot" style={{ background: part.color }} />
            {part.label}
          </span>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Seg --- */

/**
 * A row of mutually exclusive links - the tab strip on Entries, the record
 * type on the log screen.
 */
export function SegLinks({
  items,
  current,
}: {
  items: { href: string; label: string; key: string }[];
  current: string;
}) {
  return (
    <div className="seg">
      {items.map((item) => (
        <Link key={item.key} href={item.href} aria-current={item.key === current}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}
