'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatCentsPlain, PLACED_IN_SERVICE_EVIDENCE } from '@rental/domain';
import { savePropertyAction } from '@/app/actions/admin';
import { EMPTY_FORM_STATE } from '@/app/actions/formState';
import { SubmitButton } from './Pickers';

export interface PropertyDefaults {
  id?: string;
  nickname?: string;
  address?: string;
  acquiredDate?: string | null;
  unadjustedBasisCents?: number;
  ownershipPct?: string;
  isSelfManaged?: boolean;
  isTripleNet?: boolean;
  hadPersonalUse?: boolean;

  placedInServiceDate?: string | null;
  placedInServiceEvidence?: string | null;
  firstTenantDate?: string | null;
  purchasePriceCents?: number | null;
  closingCostsCents?: number | null;
  landValueCents?: number | null;
  wasPersonalResidence?: boolean;
  convertedToRentalDate?: string | null;
  fmvAtConversionCents?: number | null;
  soldDate?: string | null;
  salePriceCents?: number | null;
  section469Activity?: string | null;

  /** A uuid, or 'self'. Read from the open management period, not the row. */
  managedByActorId?: string | null;
}

export interface ManagerOption {
  id: string;
  name: string;
}

export function PropertyForm({
  defaults = {},
  enterpriseId,
  managers = [],
}: {
  defaults?: PropertyDefaults;
  enterpriseId: string;
  managers?: ManagerOption[];
}) {
  const [state, formAction] = useActionState(savePropertyAction, EMPTY_FORM_STATE);

  // Everything the closing package answers is optional and entered once, so it
  // opens only if the owner has already filled some of it in - a property with
  // no purchase facts should not greet you with eleven empty boxes.
  const hasFacts = Boolean(
    defaults.placedInServiceDate ||
      defaults.purchasePriceCents ||
      defaults.closingCostsCents ||
      defaults.landValueCents ||
      defaults.wasPersonalResidence ||
      defaults.soldDate ||
      defaults.section469Activity,
  );

  return (
    <form action={formAction} className="grid gap-1">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="enterpriseId" value={enterpriseId} />

      {state.message ? (
        <p role="alert" className="error-text mb-2">
          {state.message}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="mb-2 text-sm pos">
          {state.saved}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">Nickname</span>
        <input
          className="input"
          name="nickname"
          required
          maxLength={80}
          defaultValue={defaults.nickname}
          placeholder="Maple St"
        />
      </label>

      <label className="field">
        <span className="field-label">Address</span>
        <input
          className="input"
          name="address"
          required
          maxLength={300}
          defaultValue={defaults.address}
        />
      </label>

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
        <label className="field">
          <span className="field-label">Acquired</span>
          <input
            className="input"
            type="date"
            name="acquiredDate"
            defaultValue={defaults.acquiredDate ?? ''}
          />
        </label>

        <label className="field">
          <span className="field-label">Ownership %</span>
          <input
            className="input num"
            name="ownershipPct"
            inputMode="decimal"
            defaultValue={defaults.ownershipPct ?? '100'}
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Unadjusted basis</span>
        <input
          className="input num"
          name="unadjustedBasis"
          inputMode="decimal"
          defaultValue={
            defaults.unadjustedBasisCents ? formatCentsPlain(defaults.unadjustedBasisCents) : ''
          }
          placeholder="285000"
        />
        <span className="hint">
          What the building cost, before depreciation. Used by the small-taxpayer
          threshold check and by basis-weighted expense splits. Leave blank if you do not
          have it to hand.
        </span>
      </label>

      {/*
        One dropdown, and the period bookkeeping happens behind it. Changing this
        closes the open management period and opens the next one; the history is
        viewable on the property page and never has to be maintained by hand.
      */}
      <label className="field">
        <span className="field-label">Managed by</span>
        <select
          className="select"
          name="managedByActorId"
          defaultValue={defaults.managedByActorId ?? 'self'}
        >
          <option value="self">Self-managed</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>
        <span className="hint">
          {managers.length === 0
            ? 'No property managers on file. Add one under People if this property has one.'
            : 'Changing this records when the arrangement changed. Nothing else to do.'}
        </span>
      </label>

      <fieldset className="field">
        <legend className="field-label">This year</legend>

        <label className="row cursor-pointer">
          <span>
            <span className="rowtitle">Triple-net leased</span>
            <span className="hint">
              Takes this property out of the enterprise for the year, so its hours stop
              counting toward the target.
            </span>
          </span>
          <input
            type="checkbox"
            name="isTripleNet"
            defaultChecked={defaults.isTripleNet}
            className="h-6 w-6 shrink-0"
          />
        </label>

        <label className="row cursor-pointer">
          <span>
            <span className="rowtitle">Personal use this year</span>
            <span className="hint">
              Same effect: the property leaves the enterprise for the year.
            </span>
          </span>
          <input
            type="checkbox"
            name="hadPersonalUse"
            defaultChecked={defaults.hadPersonalUse}
            className="h-6 w-6 shrink-0"
          />
        </label>
      </fieldset>

      <PurchaseAndCpaDetails defaults={defaults} open={hasFacts} />

      <Submit isEdit={Boolean(defaults.id)} />
    </form>
  );
}

/**
 * The facts a CPA asks for and nobody enters twice.
 *
 * Collapsed, because none of it is part of adding a property and all of it
 * comes off the closing package. Every field is optional and no save is ever
 * blocked on one being empty - a half-remembered land value must never be the
 * reason a property does not get created.
 */
function PurchaseAndCpaDetails({
  defaults,
  open,
}: {
  defaults: PropertyDefaults;
  open: boolean;
}) {
  const [wasHome, setWasHome] = useState(Boolean(defaults.wasPersonalResidence));

  return (
    <details className="panel panel-body my-2" open={open}>
      <summary className="cursor-pointer text-sm font-semibold">
        Purchase &amp; CPA details
      </summary>

      <p className="hint mt-2">
        All optional, all entered once. Leave anything you do not have to hand.
      </p>

      <div className="mt-4 grid gap-1">
        <h3 className="section-title">Placed in service</h3>
        <p className="hint">
          The date it was <strong>ready and available to rent</strong> — not the date you
          bought it, and not the date someone moved in. It is where depreciation starts and
          it decides which side of the line every cost before it falls on.
        </p>

        <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
          <label className="field">
            <span className="field-label">Placed in service</span>
            <input
              className="input"
              type="date"
              name="placedInServiceDate"
              defaultValue={defaults.placedInServiceDate ?? ''}
            />
          </label>

          <label className="field">
            <span className="field-label">First tenant moved in</span>
            <input
              className="input"
              type="date"
              name="firstTenantDate"
              defaultValue={defaults.firstTenantDate ?? ''}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">What shows it was available</span>
          <select
            className="select"
            name="placedInServiceEvidence"
            defaultValue={defaults.placedInServiceEvidence ?? ''}
          >
            <option value="">Not recorded</option>
            {PLACED_IN_SERVICE_EVIDENCE.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="hint">
            {PLACED_IN_SERVICE_EVIDENCE.map((o) => `${o.label}: ${o.helper}`).join(' ')}
          </span>
        </label>
      </div>

      <div className="mt-6 grid gap-1">
        <h3 className="section-title">Off the closing statement</h3>

        <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
          <label className="field">
            <span className="field-label">Purchase price</span>
            <input
              className="input num"
              name="purchasePrice"
              inputMode="decimal"
              defaultValue={money(defaults.purchasePriceCents)}
              placeholder="310000"
            />
          </label>

          <label className="field">
            <span className="field-label">Closing costs</span>
            <input
              className="input num"
              name="closingCosts"
              inputMode="decimal"
              defaultValue={money(defaults.closingCostsCents)}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Land value</span>
          <input
            className="input num"
            name="landValue"
            inputMode="decimal"
            defaultValue={money(defaults.landValueCents)}
          />
          <span className="hint">
            From the county tax card. Land does not depreciate, so your CPA needs it split
            out — this app only holds the number.
          </span>
        </label>

        <p className="hint">
          <strong>Purchase price is what you paid. Unadjusted basis is what your CPA
          depreciates.</strong>{' '}
          They are not the same number, and only the CPA fills the second one in.
        </p>
      </div>

      <div className="mt-6 grid gap-1">
        <h3 className="section-title">Was this your home first?</h3>

        <label className="row cursor-pointer">
          <span>
            <span className="rowtitle">Converted from a personal residence</span>
            <span className="hint">
              Basis is then the lesser of what it cost and what it was worth on the day it
              became a rental — so both figures matter.
            </span>
          </span>
          <input
            type="checkbox"
            name="wasPersonalResidence"
            checked={wasHome}
            onChange={(event) => setWasHome(event.target.checked)}
            className="h-6 w-6 shrink-0"
          />
        </label>

        {wasHome ? (
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
            <label className="field">
              <span className="field-label">Became a rental on</span>
              <input
                className="input"
                type="date"
                name="convertedToRentalDate"
                defaultValue={defaults.convertedToRentalDate ?? ''}
              />
            </label>

            <label className="field">
              <span className="field-label">Market value that day</span>
              <input
                className="input num"
                name="fmvAtConversion"
                inputMode="decimal"
                defaultValue={money(defaults.fmvAtConversionCents)}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-1">
        <h3 className="section-title">If it has been sold</h3>

        <div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
          <label className="field">
            <span className="field-label">Sold on</span>
            <input
              className="input"
              type="date"
              name="soldDate"
              defaultValue={defaults.soldDate ?? ''}
            />
          </label>

          <label className="field">
            <span className="field-label">Sale price</span>
            <input
              className="input num"
              name="salePrice"
              inputMode="decimal"
              defaultValue={money(defaults.salePriceCents)}
            />
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-1">
        <h3 className="section-title">Grouping</h3>

        <label className="field">
          <span className="field-label">§469 activity</span>
          <input
            className="input"
            name="section469Activity"
            maxLength={120}
            defaultValue={defaults.section469Activity ?? ''}
            placeholder={defaults.nickname ?? 'Leave blank to keep it on its own'}
          />
          <span className="hint">
            Which activity this property is grouped into is an election you made, so it is
            recorded and exported like any other fact. This app draws no conclusion from it,
            and it is a different grouping from the enterprise above.
          </span>
        </label>
      </div>
    </details>
  );
}

function money(cents: number | null | undefined): string {
  return cents ? formatCentsPlain(cents) : '';
}

function Submit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>{isEdit ? 'Save changes' : 'Add property'}</SubmitButton>;
}
