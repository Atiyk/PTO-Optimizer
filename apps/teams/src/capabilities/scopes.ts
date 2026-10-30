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
