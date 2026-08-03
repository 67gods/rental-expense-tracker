'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  DESTINATION_KINDS,
  defaultOnsiteCategory,
  formatMinutes,
  getHourCategory,
  listHourCategories,
  type DestinationKind,
} from '@rental/domain';
import { saveTripAction } from '@/app/actions/capture';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { EligibilityBadge } from './CategoryPicker';
import { ActorPicker, PropertyPicker, SubmitButton, type Option } from './Pickers';

/**
 * Trip entry (§5.5).
 *
 * One trip, three records: the miles, the drive time, and the time actually
 * spent working once you arrived. The form shows all three so the split is
 * visible rather than something that happens to the data afterwards.
 *
 * Picking "hardware store" moves the on-site category to purchase of materials,
 * which is eligible. It never falls through to travel - that is the failure
 * this screen exists to prevent, where 40 minutes choosing a vanity gets
 * recorded as driving.
 */
export function TripForm({
  today,
  actorId,
  properties,
  people,
  jobId = null,
}: {
  today: string;
  actorId: string;
  properties: Option[];
  people: Option[];
  /** Set only when opened from "+ Add related". Hidden - never a field. */
  jobId?: string | null;
}) {
  const [state, formAction] = useActionState(saveTripAction, EMPTY_FORM_STATE);
  const [kind, setKind] = useState<DestinationKind>('property');
  const [onsiteCategory, setOnsiteCategory] = useState<string>(
    defaultOnsiteCategory('property') ?? '',
  );
  const [onsiteMinutes, setOnsiteMinutes] = useState(0);
  const [driveMinutes, setDriveMinutes] = useState(0);

  function chooseKind(next: DestinationKind) {
    setKind(next);
    setOnsiteCategory(defaultOnsiteCategory(next) ?? '');
  }

  const selected = onsiteCategory ? safeGet(onsiteCategory) : null;

  return (
    <form action={formAction} className="grid gap-1">
      {/* Reaches all three rows a trip writes: miles, drive time, on-site time. */}
      {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}

      <div className="field">
        <span className="field-label">Where did you go?</span>
        <input type="hidden" name="destinationKind" value={kind} />
        <div className="grid gap-2">
          {DESTINATION_KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="choice"
              aria-pressed={kind === option.id}
              onClick={() => chooseKind(option.id)}
            >
              <span className="choice-mark" aria-hidden="true" />
              <span className="choice-body">
                <span className="choice-title">{option.label}</span>
                <span className="hint">{option.helper}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="field-label">From</span>
          <input className="input" name="origin" required defaultValue="Home" maxLength={200} />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input
            className="input"
            name="destination"
            required
            maxLength={200}
            placeholder="Maple St"
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Miles</span>
        <input
          className="input num"
          name="miles"
          inputMode="decimal"
          required
          placeholder="12.4"
        />
        {state.fields?.miles ? <span className="error-text">{state.fields.miles}</span> : null}
      </label>

      <label className="field">
        <span className="field-label">Why did you go?</span>
        <input
          className="input"
          name="purpose"
          required
          maxLength={500}
          placeholder="Replace the kitchen faucet washer"
        />
        <span className="hint">
          The business purpose is what makes a mileage record hold up. &ldquo;Trip to
          property&rdquo; is not enough.
        </span>
      </label>

      <PropertyPicker options={properties} label="Which property was this for?" />

      <hr className="my-3 border-[color:var(--border)]" />

      <label className="field">
        <span className="field-label">Time driving (optional)</span>
        <input
          className="input num"
          name="driveMinutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={1440}
          value={driveMinutes || ''}
          onChange={(e) => setDriveMinutes(Number(e.target.value))}
          placeholder="40"
        />
        <span className="hint">
          Logged as travel, which never counts toward eligible hours. Recorded anyway
          because it is real time.
        </span>
      </label>

      <label className="field">
        <span className="field-label">Time working once you got there (optional)</span>
        <input
          className="input num"
          name="onsiteMinutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={1440}
          value={onsiteMinutes || ''}
          onChange={(e) => setOnsiteMinutes(Number(e.target.value))}
          placeholder="75"
        />
        <span className="hint">This is the part that usually counts. Do not fold it into the drive.</span>
      </label>

      {onsiteMinutes > 0 ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="onsiteCategory">
              What were you doing there?
            </label>
            <select
              id="onsiteCategory"
              className="select"
              name="onsiteCategory"
              value={onsiteCategory}
              onChange={(e) => setOnsiteCategory(e.target.value)}
              required
            >
              <option value="">Choose…</option>
              {listHourCategories()
                // Travel is captured above as drive time; offering it here
                // would let on-site work be filed as driving.
                .filter((c) => c.id !== 'travel')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
            {selected ? (
              <span className="hint mt-1 flex items-center gap-2">
                <EligibilityBadge eligible={selected.shEligible} />
                {selected.helper}
              </span>
            ) : null}
          </div>

          <label className="field">
            <span className="field-label">What did you do there?</span>
            <textarea
              className="textarea"
              name="onsiteDescription"
              maxLength={1000}
              required
              placeholder="Picked out a replacement vanity and matching trim"
            />
          </label>
        </>
      ) : null}

      {driveMinutes > 0 || onsiteMinutes > 0 ? (
        <p className="panel panel-body hint">
          This will create {[
            'a mileage record',
            driveMinutes > 0 ? `${formatMinutes(driveMinutes)} of travel time (not eligible)` : null,
            onsiteMinutes > 0
              ? `${formatMinutes(onsiteMinutes)} of ${selected?.label.toLowerCase() ?? 'on-site'} time${
                  selected ? (selected.shEligible ? ' (eligible)' : ' (not eligible)') : ''
                }`
              : null,
          ]
            .filter(Boolean)
            .join(', ')}
          .
        </p>
      ) : null}

      <label className="field mt-3">
        <span className="field-label">When?</span>
        <input className="input" type="date" name="date" defaultValue={today} required />
      </label>

      <ActorPicker options={people} defaultValue={actorId} />

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>Save trip</SubmitButton>;
}

function safeGet(id: string) {
  try {
    return getHourCategory(id);
  } catch {
    return null;
  }
}
