export type Role = 'tutor' | 'parent' | 'student' | 'manager' | 'admin';

export type GuestActor = { kind: 'guest' };

export type UserActor = {
  kind: 'user';
  userId: string;
  role: Role;
  emailVerified: boolean;
  tutorVerified: boolean;
  /** The sign-in this request belongs to. */
  familyId: string;
  /** What this caller must send in X-CSRF-Token on unsafe requests. */
  csrfToken: string;
};

export type Actor = GuestActor | UserActor;

/**
 * Works out who is calling. Role and status must come from the database on
 * every request, not from the token, so that a lock takes effect immediately.
 */
export type ActorResolver = (headers: Record<string, unknown>) => Promise<Actor>;
