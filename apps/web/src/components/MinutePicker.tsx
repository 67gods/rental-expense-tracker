'use client';

import { useState } from 'react';
import { formatMinutes } from '@rental/domain';

/**
 * Duration entry as chips (§7: minimal typing, target under 15 seconds).
 *
 * The presets cover the overwhelming majority of real entries. Typing a number
 * is still possible, but it is the exception rather than the default, because
 * a numeric keyboard in a parking lot is where entries stop getting made.
 */
const PRESETS = [15, 30, 45, 60, 90, 120, 180, 240] as const;

export function MinutePicker({
  name = 'minutes',
  defaultValue,
}: {
  name?: string;
  defaultValue?: number;
}) {
  const [minutes, setMinutes] = useState<number>(defaultValue ?? 0);
  const [custom, setCustom] = useState(
    defaultValue != null && !PRESETS.includes(defaultValue as (typeof PRESETS)[number]),
  );

  return (
    <div className="field">
      <span className="field-label">How long?</span>
      <input type="hidden" name={name} value={minutes || ''} />

      <div className="seg">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="chip"
            aria-pressed={!custom && minutes === preset}
            onClick={() => {
              setCustom(false);
              setMinutes(preset);
            }}
          >
            {formatMinutes(preset)}
          </button>
        ))}
        <button
          key="custom"
          type="button"
          className="chip"
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            setMinutes(0);
          }}
        >
          Other
        </button>
      </div>

      {custom ? (
        <label className="mt-3 block">
          <span className="hint">Minutes</span>
          <input
            className="input mt-1"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            autoFocus
            value={minutes || ''}
            onChange={(e) => setMinutes(Number(e.target.value))}
            aria-label="Minutes"
          />
        </label>
      ) : null}

      {minutes > 0 ? <p className="hint mt-2">Logging {formatMinutes(minutes)}.</p> : null}
    </div>
  );
}
