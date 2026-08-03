import { jsonBody, ok, query, route } from '@/server/http';
import { listCpaFigures, upsertCpaFigure } from '@/server/services/cpaFigures';

/**
 * Figures that came back from the CPA - depreciation and anything else this app
 * must not compute.
 *
 * Every row is transcribed from a document and `sourceNote` is required by the
 * schema, because a figure nobody can trace back to a document cannot be
 * checked next year, and an untraceable number in a tax file is worse than a
 * missing one: a missing one gets chased.
 *
 * `enteredByActorId` defaults to the caller. Who transcribed a figure is part
 * of its provenance, and making the client supply it invites the client to
 * supply someone else.
 */
export const GET = route(async (user, request) => {
  const q = query(request);
  const taxYear = q.number('taxYear') ?? user.taxYear;
  // `propertyId=portfolio` asks for the rows that belong to no property, which
  // an absent parameter cannot express - absent means "all of them".
  const raw = q.string('propertyId');
  const propertyId = raw === 'portfolio' ? null : raw;

  const figures = await listCpaFigures({ taxYear, propertyId });
  return ok({ figures, taxYear });
});

export const POST = route(async (user, request) => {
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const figure = await upsertCpaFigure({
    ...body,
    enteredByActorId: (body.enteredByActorId as string) ?? user.actor.id,
  } as Parameters<typeof upsertCpaFigure>[0]);
  return ok({ figure });
});
