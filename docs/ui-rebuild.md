# UI rebuild — the Ledger design system

Replaces the entire presentation layer. The data layer, services, domain rules,
API routes and server actions are untouched; nothing below changes a single
figure the app reports.

**Chosen direction:** `design/concept-1` — a dense working instrument in the
spirit of Linear and Arc. Persistent left rail, hairlines instead of cards,
monospaced numerics so columns align optically, roughly 24 rows to a screen.

---

## The rule this rebuild is judged against

> **No tech debt.** When a phase ends, nothing from the old system survives in
> the files that phase touched — no orphaned class, no unused component, no
> "temporary" wrapper. A legacy class left behind is not a small mess, it is a
> second design system running alongside the first.

Enforced mechanically in U11: a grep for every retired class name must return
zero hits outside the changelog, and every file in `components/` must be
imported by something.

---

## What is being deleted

**All 466 lines of `app/globals.css`.** Every one of these classes goes and none
is carried over by name:

```
badge badge-alert badge-eligible badge-flag badge-not-eligible
btn btn-block btn-danger btn-ghost btn-primary btn-quick
card card-pad cat-option chip chip-row error-text field hint input label
row row-main row-meta row-title row-value section-title select
skip-link tabbar tabbar-item table table-wrap textarea tnum
```

**27 components** are rewritten or removed. `TabBar.tsx` is deleted outright —
the Ledger direction has no bottom tab bar.

**22 route files** are rewritten.

---

## Tokens

The whole system is 18 custom properties. Anything not expressible in them is a
sign the design is drifting.

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#0b0c0e` | page |
| `--panel` | `#0f1113` | any raised surface |
| `--rail` | `#0a0b0d` | the navigation rail |
| `--line` | `#1c1f23` | hairlines, table rules |
| `--line-strong` | `#2a2f35` | input and button borders |
| `--ink` | `#e6e8eb` | primary text |
| `--ink-dim` | `#9aa1a9` | secondary text |
| `--ink-faint` | `#636b74` | labels, metadata, empty cells |
| `--accent` | `#5b8cff` | one accent, used sparingly |
| `--accent-dim` | `#2a3f6b` | selected chip background |
| `--pos` | `#3fb950` | gains, reconciled, paid |
| `--neg` | `#f85149` | losses |
| `--warn` | `#d29922` | needs a decision |
| `--plum` | `#8957e5` | capital — deliberately not red or green |
| `--mono` | system mono stack | every number |

Two rules that are not negotiable:

1. **Every number is monospaced and right aligned.** Columns of money that do
   not align optically cannot be scanned, and scanning is the entire point.
2. **Colour carries one meaning each.** Green is money in or a check that
   passed. Amber is a decision waiting on the owner. Plum is capital. Red is a
   loss. Nothing is coloured for decoration.

---

## Primitives

Nine components carry the whole UI. Anything a page needs beyond these is a
signal to extend a primitive rather than write one-off markup.

| Primitive | Shape | Replaces |
|---|---|---|
| `AppShell` | rail + top bar + content well | layout, `TabBar` |
| `StatStrip` | joined row of figures, hairline separated | ad-hoc card grids |
| `TableBox` / `Table` | bordered table with sticky uppercase head | `.card` + `.table` |
| `Panel` | titled surface with an optional body | `.card`, `.card-pad` |
| `KeyValue` | dt/dd rows with a hairline between | ad-hoc `dl` markup |
| `Tag` | small status label, one of five tones | `.badge*` |
| `FilterBar` | search + facet selects + result chip | ad-hoc filter markup |
| `Note` | accent-bordered explanation | ad-hoc `.hint` blocks |
| `Field` / `Seg` / `Button` | form controls | `.field .input .select .chip .btn*` |

---

## Phases

Each ends with its gate green and a commit. `T` typecheck · `V` vitest ·
`B` next build · `R` every route returns 200 under a signed-in session.

### U1 — Foundation
- `globals.css` rewritten from nothing. Tokens, reset, primitives.
- Old file deleted in the same commit, not left alongside.
- `app/layout.tsx` metadata kept; `viewport` gains `colorScheme: 'dark'`.
- **Gate:** T + B.

### U2 — Shell
- `AppShell` server component: rail, top bar, content well.
- Rail groups: Review (Expenses, Rent, Time, Mileage) · Records (Properties,
  Jobs, People) · Year (Overview, Year-end, Reports, Settings), each with a
  live count.
- Year switcher in the rail, driven by `?year=`, persisted across nav by a
  `withYear()` link helper so the year never silently resets.
- Under 960px the rail becomes a horizontal scroller pinned to the top.
- `TabBar.tsx`, `SignOutButton.tsx`, `TimerBar.tsx` rebuilt or deleted.
- **Gate:** T + B + R.

### U3 — Primitives
- The nine components above, in `components/ui/`.
- Each takes plain serialisable props so a server component can render it.
- **Gate:** T + B.

### U4 — Tables
- `DataTable` keeps its sort/filter/search behaviour and loses all its markup.
- Entries page: four tabs, year-aware, totals that follow the filter.
- **Gate:** T + B + R.

### U5 — Overview
- Stat strip, per-property table, "needs a decision" list, year-end progress.
- **Gate:** T + B + R.

### U6 — Detail pages
- Expense (invoice vs payments split), time entry, property, job.
- **Gate:** T + B + R.

### U7 — Year-end
- Four numbered sections. 1098s grouped by property with per-property totals.
- **Gate:** T + B + R.

### U8 — Reports
- Schedule E table with source columns, capital outside the net, download grid.
- **Gate:** T + B + R.

### U9 — Capture
- Expense, time, trip, income forms and the timer.
- **The expense form keeps exactly its current named controls.** Verified by
  diffing the `name="…"` set before and after.
- **Gate:** T + B + R + the field-count check.

### U10 — Remainder
- People, settings, login, jobs list.
- **Gate:** T + B + R.

### U11 — Debt sweep
- Grep the retired class list across `src/`; must be zero.
- Every file in `components/` must be imported somewhere; delete orphans.
- No inline `style=` outside genuinely dynamic values (bar widths).
- Focus-visible rings on every interactive element; skip link present; every
  icon-only control has an accessible name.
- **Gate:** T + V + B + the greps.

### U12 — Verification
- `npm run verify`, `npm run db:check`, every route rendered.
- **Gate:** all green.

---

## Risks, and what is done about each

| Risk | Mitigation |
|---|---|
| A page renders 500 only when signed in, so `curl` shows 307 and hides it | U2 adds a render check that follows the auth cookie; every phase gate runs it |
| Dev server and `next build` share `.next`, and building while dev runs corrupts it | Never run `build` with dev up. Stop, build, restart. |
| Rewriting forms silently drops a field and the data stops being captured | U9 diffs the `name="…"` set of every form before and after |
| The year switcher resets when navigating, so 2025 becomes invisible again | One `withYear()` helper used by every link in the rail and every tab |
| A retired class survives in one page and looks nearly right | U11 greps for all 30 by name |
