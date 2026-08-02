'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatMinutes, getHourCategory } from '@rental/domain';

export interface TimerBarProps {
  id: string;
  startedAtMs: number;
  category: string;
  propertyName: string | null;
  longRunningMinutes: number;
}

/**
 * The running-timer bar (§8.2).
 *
 * Kept visible on every screen because the brief is explicit that forgetting to
 * stop is the worse failure. Past the long-running threshold it changes colour
 * and says so - the point is that a timer left running overnight is noticed the
 * next morning rather than discovered in April.
 *
 * The elapsed count ticks in the browser off a server-supplied start time, so
 * the number is live without polling.
 */
export function TimerBar({
  id,
  startedAtMs,
  category,
  propertyName,
  longRunningMinutes,
}: TimerBarProps) {
  const [elapsed, setElapsed] = useState(() => minutesSince(startedAtMs));

  useEffect(() => {
    const tick = () => setElapsed(minutesSince(startedAtMs));
    tick();
    const handle = window.setInterval(tick, 15_000);
    // Phones suspend timers in a background tab; recompute on return rather
    // than trusting the interval to have kept up.
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [startedAtMs]);

  const isLong = elapsed >= longRunningMinutes;
  const label = safeLabel(category);

  return (
    <div
      className="flex items-center gap-3 border-t px-4 py-2 text-sm"
      style={{
        borderColor: isLong ? 'var(--color-flag-500)' : 'var(--border)',
        background: isLong ? 'var(--color-flag-50)' : 'var(--surface-sunken)',
        color: isLong ? 'var(--color-flag-700)' : 'var(--text)',
      }}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: isLong ? 'var(--color-flag-600)' : 'var(--color-eligible-500)' }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">
        <strong className="tnum">{formatMinutes(elapsed)}</strong> · {label}
        {propertyName ? ` · ${propertyName}` : ''}
        {isLong ? ' · still running — did you forget to stop it?' : ''}
      </span>
      <Link href={`/timer/${id}`} className="btn btn-ghost shrink-0 font-bold">
        Stop
      </Link>
    </div>
  );
}

function minutesSince(startedAtMs: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 60_000));
}

function safeLabel(id: string): string {
  try {
    return getHourCategory(id).label;
  } catch {
    return id;
  }
}
