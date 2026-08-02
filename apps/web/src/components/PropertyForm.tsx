'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatCentsPlain } from '@rental/domain';
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
}

export function PropertyForm({
  defaults = {},
  enterpriseId,
}: {
  defaults?: PropertyDefaults;
  enterpriseId: string;
}) {
  const [state, formAction] = useActionState(savePropertyAction, EMPTY_FORM_STATE);

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
        <p role="status" className="mb-2 text-sm text-[color:var(--color-eligible-700)]">
          {state.saved}
        </p>
      ) : null}

      <label className="field">
        <span className="label">Nickname</span>
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
        <span className="label">Address</span>
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
          <span className="label">Acquired</span>
          <input
            className="input"
            type="date"
            name="acquiredDate"
            defaultValue={defaults.acquiredDate ?? ''}
          />
        </label>

        <label className="field">
          <span className="label">Ownership %</span>
          <input
            className="input tnum"
            name="ownershipPct"
            inputMode="decimal"
            defaultValue={defaults.ownershipPct ?? '100'}
          />
        </label>
      </div>

      <label className="field">
        <span className="label">Unadjusted basis</span>
        <input
          className="input tnum"
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

      <fieldset className="field">
        <legend className="label">This year</legend>

        <label className="row cursor-pointer">
          <span className="row-main">
            <span className="row-title">Self-managed</span>
            <span className="row-meta">No property manager on this one.</span>
          </span>
          <input
            type="checkbox"
            name="isSelfManaged"
            defaultChecked={defaults.isSelfManaged}
            className="h-6 w-6 shrink-0"
          />
        </label>

        <label className="row cursor-pointer">
          <span className="row-main">
            <span className="row-title">Triple-net leased</span>
            <span className="row-meta">
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
          <span className="row-main">
            <span className="row-title">Personal use this year</span>
            <span className="row-meta">
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

      <Submit isEdit={Boolean(defaults.id)} />
    </form>
  );
}

function Submit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>{isEdit ? 'Save changes' : 'Add property'}</SubmitButton>;
}
