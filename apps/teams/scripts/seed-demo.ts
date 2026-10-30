/*
 * Creates the public demo's sample org (Northwind Labs: 25 people, San Francisco and London) if it
 * doesn't exist yet. Safe to run twice. The /demo page also creates it on first visit.
 * Usage: DATABASE_URL=postgres://… npm run seed:demo -w @daysoff/teams   (no DATABASE_URL = local PGlite)
 */
import { count, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { locations, members } from '@/db/schema';
import { demoActors } from '@/demo/demo';

const db = await getDb();
const { orgId } = await demoActors(db, new Date());
const [people] = await db.select({ n: count() }).from(members).where(eq(members.orgId, orgId));
const places = await db.select({ country: locations.countryCode }).from(locations).where(eq(locations.orgId, orgId));
console.log(`Demo org ready: ${people!.n} people in ${[...new Set(places.map((p) => p.country))].join(' and ')}.`);
process.exit(0);
