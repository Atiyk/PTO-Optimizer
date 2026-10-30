/** OAuth-style scopes. Humans get them from their role; tokens get an explicit subset. */
export const SCOPES = [
  'leave:read',
  'leave:request',
  'leave:approve',
  'policy:read',
  'policy:draft',
  'planner:run',
  'admin',
] as const;
export type Scope = (typeof SCOPES)[number];

export type Role = 'owner' | 'admin' | 'manager' | 'employee';

const EMPLOYEE: Scope[] = ['leave:read', 'leave:request', 'policy:read'];
const MANAGER: Scope[] = [...EMPLOYEE, 'leave:approve', 'planner:run'];
const ADMIN: Scope[] = [...MANAGER, 'policy:draft', 'admin'];

export const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  employee: EMPLOYEE,
  manager: MANAGER,
  admin: ADMIN,
  owner: ADMIN,
};

/** Plain-language meaning of each scope, for consent screens, token settings and agent docs. */
export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  'leave:read': 'See balances, requests, who is out and public holidays (what the person could see in the app).',
  'leave:request': 'Draft and submit leave requests, cancel them and answer leave suggestions.',
  'leave:approve': 'Approve or decline requests from the people this person manages.',
  'policy:read': 'Read leave policies and explain balances.',
  'policy:draft': 'Draft leave policies from a handbook for an admin to confirm.',
  'planner:run': 'Run the team planner and send leave suggestions.',
  admin: 'Change workspace settings, people and policies.',
};
