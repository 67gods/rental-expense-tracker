import {
  DESTINATION_KINDS,
  listHourCategories,
  listScheduleECategories,
  RENT_SOURCES,
  SAFE_HARBOR_HOUR_TARGET,
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
    safeHarborHourTarget: SAFE_HARBOR_HOUR_TARGET,
  });
});
