import { jsonBody, ok, route } from '@/server/http';
import { getRunningTimer, startTimer, stopTimer } from '@/server/services/timer';

/** The running timer for the signed-in person, or null. */
export const GET = route(async (user) => {
  return ok({ timer: await getRunningTimer(user.actor.id) });
});

export const POST = route(async (user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const timer = await startTimer({
    ...body,
    actorId: user.actor.id,
    enterpriseId: (body.enterpriseId as string) ?? user.enterprise.id,
  } as Parameters<typeof startTimer>[0]);
  return ok({ timer }, 201);
});

/** Stops the timer and returns the entry it produced. */
export const PATCH = route(async (_user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  return ok(await stopTimer(body as Parameters<typeof stopTimer>[0]));
});
