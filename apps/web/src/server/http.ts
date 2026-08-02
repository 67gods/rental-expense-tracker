import { NextResponse } from 'next/server';
import { requireUser, type CurrentUser } from '@/lib/session';
import { toErrorPayload } from './errors';

/**
 * Shared plumbing for the /api/v1 handlers.
 *
 * This surface exists now, at M1, because the Android client consumes exactly
 * these endpoints at M4. Building the web UI against a different private path
 * would mean writing the whole thing twice.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Wraps a handler with authentication and error translation, so every endpoint
 * fails the same way and no handler has to remember either.
 */
export function route<Args extends unknown[]>(
  handler: (user: CurrentUser, request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      const user = await requireUser();
      return await handler(user, request, ...args);
    } catch (error) {
      const payload = toErrorPayload(error);
      return NextResponse.json(
        { error: payload.error, message: payload.message, fields: payload.fields },
        { status: payload.status },
      );
    }
  };
}

/** Parses a JSON body, failing with a usable message rather than a stack trace. */
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new SyntaxError('The request body was not valid JSON.');
  }
}

/** Reads typed query parameters off the request URL. */
export function query(request: Request) {
  const params = new URL(request.url).searchParams;
  return {
    string(name: string): string | undefined {
      return params.get(name) ?? undefined;
    },
    number(name: string): number | undefined {
      const raw = params.get(name);
      if (raw == null || raw.trim() === '') return undefined;
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    },
    boolean(name: string): boolean {
      const raw = params.get(name);
      return raw === 'true' || raw === '1';
    },
  };
}
