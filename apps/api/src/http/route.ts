import type { CookieOptions } from 'express';
import { z } from 'zod';
import type { Actor } from '../auth/actor.js';
import type { Policy } from '../policies/policy.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type SuccessStatus = 200 | 201 | 202;

const empty = z.object({});
type ZodObjectAny = z.ZodObject<z.ZodRawShape>;

export type CookieJar = {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  clear(name: string, options: CookieOptions): void;
};

export type HandlerContext<P, Q, B> = {
  actor: Actor;
  params: P;
  query: Q;
  body: B;
  cookies: CookieJar;
  requestId: string;
};

export type RouteDefinition<
  P extends ZodObjectAny,
  Q extends ZodObjectAny,
  B extends z.ZodType,
  O extends z.ZodType,
> = {
  method: HttpMethod;
  /** Relative to /api/v1. Parameters use Express syntax: /students/:id */
  path: string;
  summary: string;
  tag: string;
  input?: { params?: P; query?: Q; body?: B };
  /** Required on purpose: a route without a policy does not compile or start. */
  policy: Policy<z.output<P>, z.output<Q>, z.output<B>>;
  /**
   * Only for the caller's own account endpoints. Everything else refuses
   * accounts that have not verified their email (AC-ACC-02.2).
   */
  allowUnverifiedEmail?: boolean;
  /** Fields not listed here are stripped from the response. */
  output: O;
  successStatus?: SuccessStatus;
  handler: (context: HandlerContext<z.output<P>, z.output<Q>, z.output<B>>) => Promise<z.input<O>>;
};

export type AnyRoute = {
  method: HttpMethod;
  path: string;
  summary: string;
  tag: string;
  input: { params: ZodObjectAny; query: ZodObjectAny; body?: z.ZodType };
  policy: Policy<never, never, never>;
  allowUnverifiedEmail: boolean;
  output: z.ZodType;
  successStatus: SuccessStatus;
  handler: (context: HandlerContext<never, never, never>) => Promise<unknown>;
};

export function defineRoute<
  P extends ZodObjectAny = typeof empty,
  Q extends ZodObjectAny = typeof empty,
  B extends z.ZodType = z.ZodUndefined,
  O extends z.ZodType = z.ZodType,
>(definition: RouteDefinition<P, Q, B, O>): AnyRoute {
  // TypeScript enforces these too; this also catches casts and plain JavaScript.
  if (typeof definition.policy !== 'function') {
    throw new Error(`Route ${definition.method} ${definition.path} has no policy`);
  }
  if (!definition.output) {
    throw new Error(`Route ${definition.method} ${definition.path} has no output schema`);
  }
  return {
    method: definition.method,
    path: definition.path,
    summary: definition.summary,
    tag: definition.tag,
    input: {
      params: definition.input?.params ?? empty,
      query: definition.input?.query ?? empty,
      body: definition.input?.body,
    },
    policy: definition.policy as unknown as AnyRoute['policy'],
    allowUnverifiedEmail: definition.allowUnverifiedEmail ?? false,
    output: definition.output,
    successStatus: definition.successStatus ?? 200,
    handler: definition.handler as unknown as AnyRoute['handler'],
  } as AnyRoute;
}
