import {
  COST_TREATMENTS,
  CPA_FIGURE_KINDS,
  DESTINATION_KINDS,
  DOCUMENT_SOURCES,
  listHourCategories,
  listScheduleECategories,
  PAYMENT_METHODS,
  PLACED_IN_SERVICE_EVIDENCE,
  RECONCILIATION_KINDS,
  RENT_SOURCES,
  thresholdsFor,
} from '@rental/domain';
import { ok, route } from '@/server/http';
import {
  excludedPropertyIds,
  listActors,
  listEnterprises,
  listProperties,
} from '@/server/services/reference';

/**
 * One call that bootstraps a client: who you are, what exists, and every
 * category list.
 *
 * The Android client at M4 caches this for offline entry, which is why the
 * category tables ship over the wire from the shared domain package rather
 * than being hard-coded a second time in the app.
 */
export const GET = route(async (user) => {
  const [properties, actors, enterprises, excluded] = await Promise.all([
    listProperties(),
    listActors(),
    listEnterprises(),
    excludedPropertyIds(user.enterprise.id),
  ]);

  return ok({
    me: {
      actorId: user.actor.id,
      name: user.actor.name,
      email: user.email,
      type: user.actor.type,
    },
    enterprise: user.enterprise,
    taxYear: user.taxYear,
    timeZone: user.timeZone,
    enterprises,
    properties,
    actors,
    excludedPropertyIds: excluded,
    hourCategories: listHourCategories(),
    scheduleECategories: listScheduleECategories(),
    destinationKinds: DESTINATION_KINDS,
    rentSources: RENT_SOURCES,
    documentSources: DOCUMENT_SOURCES,
    paymentMethods: PAYMENT_METHODS,
    placedInServiceEvidence: PLACED_IN_SERVICE_EVIDENCE,
    cpaFigureKinds: CPA_FIGURE_KINDS,
    reconciliationKinds: RECONCILIATION_KINDS,
    costTreatments: COST_TREATMENTS,
    // Sent as the whole set for the user's year rather than one bare number.
    // A client that caches this offline must cache the year alongside it, or it
    // will happily apply a stale threshold on 1 January.
    taxYearThresholds: thresholdsFor(user.taxYear),
    safeHarborHourTarget: thresholdsFor(user.taxYear).safeHarborHourTarget,
  });
});
