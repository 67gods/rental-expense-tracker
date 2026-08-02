import { describe, expect, it } from 'vitest';
import {
  buildTripDrafts,
  defaultOnsiteCategory,
  DESTINATION_KINDS,
  totalMiles,
  TripError,
  type TripInput,
} from '../src/rules/trips';
import type { DestinationKind } from '../src/types';

const trip = (over: Partial<TripInput> = {}): TripInput => ({
  date: '2026-03-14',
  actorId: 'actor-1',
  enterpriseId: 'ent-1',
  propertyId: 'prop-1',
  origin: 'Home',
  destination: 'Maple St',
  destinationKind: 'property',
  miles: 12.4,
  purpose: 'Replace the kitchen faucet washer',
  ...over,
});

describe('§5.5 a trip produces up to three linked records', () => {
  it('produces mileage, drive time, and on-site time', () => {
    const drafts = buildTripDrafts(
      trip({
        driveMinutes: 40,
        onsiteMinutes: 75,
        onsiteDescription: 'Swapped the faucet washer and checked under the sink',
      }),
    );

    expect(drafts.mileage.miles).toBe(12.4);
    expect(drafts.driveTime?.minutes).toBe(40);
    expect(drafts.onsiteTime?.minutes).toBe(75);
  });

  it('always logs drive time as travel and never as eligible', () => {
    const drafts = buildTripDrafts(trip({ driveMinutes: 40 }));
    expect(drafts.driveTime?.category).toBe('travel');
    expect(drafts.driveTime?.shEligible).toBe(false);
  });

  it('keeps the productive on-site time eligible and separate from the drive', () => {
    const drafts = buildTripDrafts(
      trip({
        driveMinutes: 40,
        onsiteMinutes: 75,
        onsiteDescription: 'Replaced the washer',
      }),
    );
    // The whole point of the split: 75 eligible minutes that would otherwise
    // have been buried inside a 115-minute travel entry.
    expect(drafts.onsiteTime?.shEligible).toBe(true);
    expect(drafts.driveTime?.shEligible).toBe(false);
  });

  it('omits drive time when none was recorded', () => {
    const drafts = buildTripDrafts(trip({ driveMinutes: 0 }));
    expect(drafts.driveTime).toBeNull();
  });

  it('omits on-site time when the stop had none worth logging', () => {
    const drafts = buildTripDrafts(trip({ driveMinutes: 30, onsiteMinutes: null }));
    expect(drafts.onsiteTime).toBeNull();
    expect(drafts.mileage).toBeTruthy();
  });

  it('carries the trip purpose into the drive-time description', () => {
    const drafts = buildTripDrafts(trip({ driveMinutes: 30 }));
    expect(drafts.driveTime?.description).toContain('Replace the kitchen faucet washer');
    expect(drafts.driveTime?.description).toContain('Maple St');
  });
});

describe('§5.5 a hardware store stop never defaults to travel', () => {
  it('defaults a hardware store to purchase of materials', () => {
    expect(defaultOnsiteCategory('hardware_store')).toBe('materials_purchase');
  });

  it('produces eligible on-site time for a hardware store run', () => {
    const drafts = buildTripDrafts(
      trip({
        destination: 'Home Depot',
        destinationKind: 'hardware_store',
        propertyId: null,
        onsiteMinutes: 35,
        onsiteDescription: 'Picked out a replacement vanity and matching trim',
      }),
    );

    expect(drafts.onsiteTime?.category).toBe('materials_purchase');
    expect(drafts.onsiteTime?.shEligible).toBe(true);
  });

  it('never defaults any destination to travel', () => {
    for (const kind of DESTINATION_KINDS) {
      expect(defaultOnsiteCategory(kind.id)).not.toBe('travel');
    }
  });

  it('defaults the other destination kinds sensibly', () => {
    expect(defaultOnsiteCategory('property')).toBe('repairs_maintenance');
    expect(defaultOnsiteCategory('contractor')).toBe('contractor_management');
    expect(defaultOnsiteCategory('bank')).toBe('rent_collection');
  });

  it('refuses to guess for an unclassified destination', () => {
    expect(defaultOnsiteCategory('other')).toBeNull();
    expect(() =>
      buildTripDrafts(
        trip({
          destinationKind: 'other' as DestinationKind,
          onsiteMinutes: 30,
          onsiteDescription: 'Something',
        }),
      ),
    ).toThrow(/Pick a category/);
  });

  it('rejects on-site time logged as travel, which would discard eligible work', () => {
    expect(() =>
      buildTripDrafts(
        trip({
          onsiteMinutes: 30,
          onsiteCategory: 'travel',
          onsiteDescription: 'Sat in the car',
        }),
      ),
    ).toThrow(/cannot be logged as travel/);
  });

  it('lets the user override the default category', () => {
    const drafts = buildTripDrafts(
      trip({
        destinationKind: 'hardware_store',
        onsiteMinutes: 20,
        onsiteCategory: 'contractor_management',
        onsiteDescription: 'Met the plumber in the aisle to price the job',
      }),
    );
    expect(drafts.onsiteTime?.category).toBe('contractor_management');
  });
});

describe('§5.2 applies to on-site time too', () => {
  it('excludes on-site time linked to a capital improvement', () => {
    const drafts = buildTripDrafts(
      trip({
        onsiteMinutes: 90,
        onsiteDescription: 'Walked the roof with the contractor',
        linkedCapitalClassification: 'improvement',
      }),
    );
    expect(drafts.onsiteTime?.shEligible).toBe(false);
  });

  it('marks on-site time provisional while the work is unclassified', () => {
    const drafts = buildTripDrafts(
      trip({
        onsiteMinutes: 90,
        onsiteDescription: 'Assessed the water damage',
        linkedCapitalClassification: 'needs_review',
      }),
    );
    expect(drafts.onsiteTime?.shEligible).toBe(true);
    expect(drafts.onsiteTime?.isProvisional).toBe(true);
  });
});

describe('§5.5 a mileage record must be defensible', () => {
  it('requires a business purpose', () => {
    expect(() => buildTripDrafts(trip({ purpose: '   ' }))).toThrow(TripError);
    expect(() => buildTripDrafts(trip({ purpose: '' }))).toThrow(/business purpose/);
  });

  it('requires a start and a destination', () => {
    expect(() => buildTripDrafts(trip({ origin: '' }))).toThrow(/starting point/);
    expect(() => buildTripDrafts(trip({ destination: '' }))).toThrow(/destination/);
  });

  it('requires positive miles', () => {
    expect(() => buildTripDrafts(trip({ miles: 0 }))).toThrow(/positive/);
    expect(() => buildTripDrafts(trip({ miles: -5 }))).toThrow(/positive/);
  });

  it('requires a description for on-site time - a category alone is not a record', () => {
    expect(() =>
      buildTripDrafts(trip({ onsiteMinutes: 60, onsiteDescription: '  ' })),
    ).toThrow(/Describe what you did/);
  });

  it('trims stray whitespace out of the stored record', () => {
    const drafts = buildTripDrafts(
      trip({ origin: '  Home  ', destination: ' Maple St ', purpose: ' Fix sink ' }),
    );
    expect(drafts.mileage.origin).toBe('Home');
    expect(drafts.mileage.destination).toBe('Maple St');
    expect(drafts.mileage.purpose).toBe('Fix sink');
  });
});

describe('mileage totals', () => {
  it('sums miles to one decimal', () => {
    expect(totalMiles([{ miles: 12.4 }, { miles: 8.3 }, { miles: 0.4 }])).toBe(21.1);
    expect(totalMiles([])).toBe(0);
  });
});
