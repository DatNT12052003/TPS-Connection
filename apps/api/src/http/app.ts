import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, {
  type CookieOptions,
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { ActorResolver } from '../auth/actor.js';
import { parseCookies } from '../auth/cookies.js';
import { csrfMatches } from '../auth/tokens.js';
import { publicAccess } from '../policies/policy.js';
import { ApiError, forbidden, notFound, unauthorized, type FieldError } from './errors.js';
import type { AnyRoute } from './route.js';

export const API_PREFIX = '/api/v1';

export type AppOptions = {
  routes: AnyRoute[];
  resolveActor: ActorResolver;
  logger: Logger;
  webOrigins: string[];
};

const toFieldErrors = (error: z.ZodError, location: string): FieldError[] =>
  error.issues.map((issue) => ({
    path: [location, ...issue.path].join('.'),
    code: issue.code.toUpperCase(),
  }));

function parseInput<S extends z.ZodType>(schema: S, value: unknown, location: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      'INVALID_INPUT',
      'Invalid input',
      toFieldErrors(result.error, location),
    );
  }
  return result.data;
}

function handle(route: AnyRoute, resolveActor: ActorResolver): RequestHandler {
  return async (req, res, next) => {
    try {
      const actor = await resolveActor(req.headers);

      // Public routes act on no signed-in identity, so a forged request gains nothing.
      if ((route.policy as unknown) !== publicAccess) {
        if (actor.kind === 'guest') throw unauthorized();
        if (route.method !== 'get' && !csrfMatches(req.get('x-csrf-token'), actor.csrfToken)) {
          throw forbidden('CSRF_TOKEN_INVALID');
        }
        if (!actor.emailVerified && !route.allowUnverifiedEmail) {
          throw forbidden('EMAIL_NOT_VERIFIED');
        }
      }

      const params = parseInput(route.input.params, req.params, 'params');
      const query = parseInput(route.input.query, req.query, 'query');
      const body = route.input.body ? parseInput(route.input.body, req.body, 'body') : undefined;

      const context = { actor, params, query, body } as never;
      const decision = await route.policy(context);
      if (!decision.allow) throw decision.reveal ? forbidden(decision.code) : notFound();

      const cookies = parseCookies(req.headers.cookie);
      const result = await route.handler({
        ...(context as object),
        cookies: {
          get: (name: string) => cookies[name],
          set: (name: string, value: string, options: CookieOptions) => {
            res.cookie(name, value, options);
          },
          clear: (name: string, options: CookieOptions) => {
            res.clearCookie(name, options);
          },
        },
        requestId: res.locals.requestId as string,
      } as never);

      // Lists permitted fields only, so a new column can never leak on its own.
      res.status(route.successStatus).json(route.output.parse(result));
    } catch (error) {
      next(error);
    }
  };
}

function sendProblem(res: Response, error: ApiError): void {
  res
    .set(error.headers)
    .status(error.status)
    .type('application/problem+json')
    .json({
      type: `urn:tps-connection:error:${error.code.toLowerCase().replaceAll('_', '-')}`,
      title: error.title,
      status: error.status,
      code: error.code,
      requestId: res.locals.requestId,
      fields: error.fields,
    });
}

function toApiError(error: unknown): ApiError | undefined {
  if (error instanceof ApiError) return error;
  const type = (error as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') return new ApiError(400, 'MALFORMED_JSON', 'Malformed JSON');
  if (type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
  }
  return undefined;
}

export function createApp({ routes, resolveActor, logger, webOrigins }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => (res as Response).locals.requestId as string,
      // No bodies, query strings, cookies or headers: they can hold personal data (NFR-S09).
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: webOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  for (const route of routes) {
    app[route.method](`${API_PREFIX}${route.path}`, handle(route, resolveActor));
  }

  app.use((_req, _res, next) => next(notFound()));

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    const known = toApiError(error);
    if (known) return sendProblem(res, known);
    req.log.error({ err: error }, 'Unhandled error');
    return sendProblem(res, new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'));
  });

  return app;
}

type RegisteredRoute = { path: unknown; methods: Record<string, boolean> };

/** Every route actually registered on the Express app, for the security test. */
export function listRegisteredRoutes(app: Express): string[] {
  const { stack } = (app as unknown as { router: { stack: { route?: RegisteredRoute }[] } }).router;
  return stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods).map((method) => `${method} ${String(layer.route?.path)}`)
      : [],
  );
}
