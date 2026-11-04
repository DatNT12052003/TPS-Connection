import type { Role } from '../auth/actor.js';
import { allow, deny, type Policy } from './policy.js';

const onlyRole =
  (role: Role, code: string): Policy =>
  ({ actor }) =>
    actor.kind === 'user' && actor.role === role ? allow() : deny({ reveal: true, code });

/** SELF for a tutor: handlers only ever read and write the caller's own profile. */
export const tutorOnly = onlyRole('tutor', 'TUTOR_ROLE_REQUIRED');

/** Managers are refused too: the catalog belongs to Admin alone (C1). */
export const adminOnly = onlyRole('admin', 'ADMIN_ROLE_REQUIRED');
