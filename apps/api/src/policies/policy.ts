import type { Actor } from '../auth/actor.js';

export type Decision = { allow: true } | { allow: false; reveal: boolean; code: string };

export type PolicyContext<P = unknown, Q = unknown, B = unknown> = {
  actor: Actor;
  params: P;
  query: Q;
  body: B;
};

export type Policy<P = unknown, Q = unknown, B = unknown> = (
  context: PolicyContext<P, Q, B>,
) => Decision | Promise<Decision>;

export const allow = (): Decision => ({ allow: true });

/**
 * reveal: false answers 404, for callers with no relationship to the resource,
 * so that its existence stays hidden. reveal: true answers 403, for callers who
 * already know about it.
 */
export const deny = ({
  reveal = false,
  code = 'FORBIDDEN',
}: { reveal?: boolean; code?: string } = {}): Decision => ({
  allow: false,
  reveal,
  code,
});

/** The only way to open a route to guests. Search the code for it to audit them. */
export const publicAccess: Policy = () => allow();
