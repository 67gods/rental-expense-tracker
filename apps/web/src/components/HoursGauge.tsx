import { formatMinutes, type SafeHarborProgress } from '@rental/domain';

/**
 * The enterprise hours gauge (§7.1, §10).
 *
 * The acceptance criterion is that eligible and total hours never appear as a
 * single merged number. This component takes the whole `SafeHarborProgress`
 * rather than a number, so there is no way to call it with one figure and no
 * way for the two to be added together on the way in.
 *
 * The bar measures eligible hours only. Total logged sits beside it as context,
 * visibly a different number rather than a larger version of the same one.
 */
export function HoursGauge({ progress }: { progress: SafeHarborProgress }) {
  const { eligibleHours, totalHours, targetHours, pctOfTarget, remainingHours } = progress;

  return (
    <section className="card card-pad" aria-labelledby="hours-heading">
      <h2 id="hours-heading" className="section-title">
        Documented hours · {progress.entryCount} entries
      </h2>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="tnum text-4xl font-bold tracking-tight">{eligibleHours}</span>
        <span className="text-sm font-semibold text-[color:var(--text-muted)]">
          eligible of {targetHours}
        </span>
      </div>

      <div
        className="mt-3 h-3 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--surface-sunken)' }}
        role="meter"
        aria-valuenow={eligibleHours}
        aria-valuemin={0}
        aria-valuemax={targetHours}
        aria-label={`${eligibleHours} eligible hours of ${targetHours}`}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${Math.max(pctOfTarget, eligibleHours > 0 ? 2 : 0)}%`,
            background: progress.targetMet
              ? 'var(--color-eligible-500)'
              : 'var(--color-brand-500)',
          }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="hint">Total logged</dt>
          <dd className="tnum font-semibold">{totalHours} h</dd>
        </div>
        <div>
          <dt className="hint">{progress.targetMet ? 'Past target by' : 'Still needed'}</dt>
          <dd className="tnum font-semibold">
            {progress.targetMet
              ? `${Math.round((eligibleHours - targetHours) * 100) / 100} h`
              : `${remainingHours} h`}
          </dd>
        </div>
      </dl>

      {progress.totalMinutes > progress.eligibleMinutes ? (
        <p className="hint mt-3">
          {formatMinutes(progress.totalMinutes - progress.eligibleMinutes)} of the time
          logged does not count toward the target — travel, statement review, capital
          improvement work, and anything on a property currently outside the enterprise.
        </p>
      ) : null}

      {progress.provisionalEligibleMinutes > 0 ? (
        <p className="mt-3 rounded-lg border border-[color:var(--color-flag-500)] bg-[color:var(--color-flag-50)] p-2.5 text-xs text-[color:var(--color-flag-700)]">
          <strong>{formatMinutes(progress.provisionalEligibleMinutes)}</strong> of that
          eligible total depends on work that has not been classified as a repair or an
          improvement yet. If any of it turns out to be an improvement, those hours stop
          counting.
        </p>
      ) : null}

      {progress.excludedPropertyMinutes > 0 ? (
        <p className="hint mt-2">
          {formatMinutes(progress.excludedPropertyMinutes)} logged against properties
          outside the enterprise this year. Counted in the total, not in eligible.
        </p>
      ) : null}
    </section>
  );
}
