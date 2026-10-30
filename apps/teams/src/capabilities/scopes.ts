/** OAuth-style scopes. Humans get them from their role; tokens get an explicit subset. */
export const SCOPES = [
  'leave:read',
  'leave:request',
  'leave:approve',
  'policy:read',
  'policy:draft',
  'planner:run',
  'coverage:read',
  'cover:request',
  'cover:respond',
  'rules:draft',
  'admin',
] as const;
export type Scope = (typeof SCOPES)[number];

export type Role = 'owner' | 'admin' | 'manager' | 'employee';

const EMPLOYEE: Scope[] = ['leave:read', 'leave:request', 'policy:read', 'coverage:read', 'cover:respond'];
const MANAGER: Scope[] = [...EMPLOYEE, 'leave:approve', 'planner:run', 'cover:request'];
const ADMIN: Scope[] = [...MANAGER, 'policy:draft', 'rules:draft', 'admin'];

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
  'coverage:read': 'See staffing coverage, gaps and the rules behind them, schedules and credential expiry dates (own site for staff).',
  'cover:request': 'Find ranked cover for a gap and send cover offers (offers from agents wait for a person to confirm).',
  'cover:respond': 'Answer cover offers and report a call-off for yourself.',
  'rules:draft': 'Draft a rule pack from pasted regulation or handbook text for an admin to confirm.',
  admin: 'Change workspace settings, people and policies.',
};
