import { ZodError } from 'zod';
import {
  AllocationError,
  DateError,
  MoneyError,
  TripError,
  UnknownHourCategoryError,
  UnknownScheduleECategoryError,
} from '@rental/domain';
import { ConfigError } from '@/env';
import { UnauthorizedError } from '@/lib/session';

/**
 * Turns any error from the domain, the validators, or the database into
 * something the user can act on.
 *
 * The rule is that a message either tells the person what to change, or it is
 * a bug and says so. Nothing gets swallowed into "something went wrong".
 */

export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';
}

export class ValidationError extends Error {
  override readonly name = 'ValidationError';
  constructor(
    message: string,
    /** Field-level messages, keyed by form field name. */
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export interface ErrorPayload {
  status: number;
  error: string;
  message: string;
  fields?: Record<string, string>;
}

export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    return {
      status: 400,
      error: 'validation_failed',
      message: error.issues[0]?.message ?? 'Some of those details need fixing.',
      fields,
    };
  }

  if (error instanceof ValidationError) {
    return {
      status: 400,
      error: 'validation_failed',
      message: error.message,
      fields: error.fields,
    };
  }

  if (error instanceof UnauthorizedError) {
    return { status: 401, error: 'unauthenticated', message: error.message };
  }

  if (error instanceof NotFoundError) {
    return { status: 404, error: 'not_found', message: error.message };
  }

  // Domain rules refusing an invalid state. These messages are written for the
  // user already, so they pass through unchanged.
  if (
    error instanceof AllocationError ||
    error instanceof TripError ||
    error instanceof MoneyError ||
    error instanceof DateError ||
    error instanceof UnknownHourCategoryError ||
    error instanceof UnknownScheduleECategoryError
  ) {
    return { status: 400, error: 'rule_violation', message: error.message };
  }

  if (error instanceof ConfigError) {
    return { status: 500, error: 'not_configured', message: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);

  // Database constraint violations. The constraint names carry the intent, so
  // they are translated rather than shown raw.
  if (message.includes('time_entries_description_present')) {
    return {
      status: 400,
      error: 'rule_violation',
      message: 'Describe what you did. A category on its own is not a record.',
    };
  }
  if (message.includes('expenses_property_or_allocation')) {
    return {
      status: 400,
      error: 'rule_violation',
      message: 'Pick a property, or set up a split across several.',
    };
  }
  if (message.includes('timers_one_running_per_actor')) {
    return {
      status: 409,
      error: 'timer_running',
      message: 'You already have a timer running. Stop it before starting another.',
    };
  }
  if (message.includes('violates foreign key constraint')) {
    return {
      status: 400,
      error: 'rule_violation',
      message: 'That refers to a record that no longer exists. Reload and try again.',
    };
  }

  console.error('Unhandled error:', error);
  return {
    status: 500,
    error: 'internal_error',
    message: 'Something broke on our side. The entry was not saved, so try again.',
  };
}
