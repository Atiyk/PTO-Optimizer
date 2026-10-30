import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from './schema';

/*
 * The child-data rule (COVERAGE-SPEC §6): demand is counts per group only. No column anywhere
 * may hold child-identifying data. Capability schemas get the same check in Phase 2.
 */
export const CHILD_DATA_DENY = /child.?(name|first|last|dob|birth|id\b|address|guardian|parent|allerg|medical)|birth.?date|date.?of.?birth|\bdob\b|guardian|allerg|enrol+ee|student.?name|kid.?name|pupil/i;

describe('no child data in the schema', () => {
  const tables = (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable));

  it('finds the coverage tables', () => {
    expect(tables.map((t) => getTableName(t))).toEqual(expect.arrayContaining(['demand_templates', 'demand_exceptions', 'rooms']));
  });

  it('no table or column name matches the child-data deny list', () => {
    const hits: string[] = [];
    for (const t of tables) {
      const name = getTableName(t);
      if (CHILD_DATA_DENY.test(name)) hits.push(name);
      for (const col of Object.values(getTableColumns(t))) if (CHILD_DATA_DENY.test(col.name)) hits.push(`${name}.${col.name}`);
    }
    expect(hits).toEqual([]);
  });

  it('demand tables hold counts, not people', () => {
    for (const t of [schema.demandTemplates, schema.demandExceptions]) {
      const cols = Object.values(getTableColumns(t)).map((c) => c.name).sort();
      expect(cols.filter((c) => !['id', 'org_id', 'room_id', 'weekday', 'date', 'closed', 'start_minute', 'end_minute', 'group_key', 'count', 'created_at'].includes(c))).toEqual([]);
    }
  });

  it('the deny list catches the obvious shapes', () => {
    for (const bad of ['child_name', 'childFirstName', 'date_of_birth', 'dob', 'guardian_phone', 'allergies', 'birthdate']) expect(CHILD_DATA_DENY.test(bad), bad).toBe(true);
    for (const ok of ['count', 'group_key', 'children', 'member_id', 'start_minute']) expect(CHILD_DATA_DENY.test(ok), ok).toBe(false);
  });
});
