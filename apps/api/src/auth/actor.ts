export type Role = 'tutor' | 'parent' | 'student' | 'manager' | 'admin';

export type GuestActor = { kind: 'guest' };

export type UserActor = {
  kind: 'user';
  userId: string;
  role: Role;
  tutorVerified: boolean;
};

export type Actor = GuestActor | UserActor;

/**
 * Works out who is calling. Role and status must come from the database on
 * every request, not from the token, so that a lock takes effect immediately.
 */
export type ActorResolver = (headers: Record<string, unknown>) => Promise<Actor>;

/** Sign-in arrives in M1. Until then every caller is a guest. */
export const guestOnlyResolver: ActorResolver = async () => ({ kind: 'guest' });
