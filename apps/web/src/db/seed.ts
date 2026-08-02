/**
 * Seeds the enterprise and five placeholder properties. Run with: npm run db:seed
 *
 * Placeholders rather than invented data: the nicknames and addresses are
 * obviously fake so nobody mistakes them for real records, and every one is
 * editable under Properties. Nothing here creates time, expense, or income
 * records - a tax log seeded with fiction is worse than an empty one.
 *
 * Safe to run more than once. It never overwrites an existing property.
 */

import './loadEnv';
import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { enterprises, properties } from './schema';
import { env } from '@/env';

const PLACEHOLDER_PROPERTIES = [
  { nickname: 'Property 1', address: '1 Example St' },
  { nickname: 'Property 2', address: '2 Example St' },
  { nickname: 'Property 3', address: '3 Example St' },
  { nickname: 'Property 4', address: '4 Example St' },
  { nickname: 'Property 5', address: '5 Example St' },
];

async function main() {
  const db = getDb();
  const year = new Date().getFullYear();

  let [enterprise] = await db.select().from(enterprises).limit(1);
  if (!enterprise) {
    // §5.4 default: all five properties in one residential enterprise.
    [enterprise] = await db
      .insert(enterprises)
      .values({
        name: 'Residential portfolio',
        propertyType: 'residential',
        taxYearActive: year,
      })
      .returning();
    console.log('Created enterprise: Residential portfolio');
  } else {
    console.log(`Using existing enterprise: ${enterprise.name}`);
  }

  if (!enterprise) throw new Error('Could not create the enterprise.');

  const existing = await db
    .select({ nickname: properties.nickname })
    .from(properties)
    .where(eq(properties.enterpriseId, enterprise.id));

  if (existing.length > 0) {
    console.log(
      `${existing.length} propert${existing.length === 1 ? 'y' : 'ies'} already exist. Nothing added.`,
    );
    return;
  }

  await db.insert(properties).values(
    PLACEHOLDER_PROPERTIES.map((p) => ({
      enterpriseId: enterprise.id,
      nickname: p.nickname,
      address: p.address,
    })),
  );

  console.log(`Added ${PLACEHOLDER_PROPERTIES.length} placeholder properties.`);
  console.log('Rename them and fill in addresses and basis figures under Properties.');
  console.log(`Timezone in use: ${env.timeZone}`);
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
