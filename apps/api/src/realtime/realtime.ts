// Realtime (Socket.IO, G5 đợt 2). Server chỉ đẩy sự kiện tới phòng `user:<id>` của từng người dùng; client không gửi
// sự kiện nào (mọi thao tác đi qua REST, nơi đã có xác thực, phân quyền, validate và rate limit). Tên sự kiện và
// payload: `REALTIME_EVENTS` trong `@tps/shared`.
//
// - Xác thực khi bắt tay: cookie `tps_at` (web) hoặc `auth.token` (mobile), đọc lại tài khoản như middleware
//   `authenticate`. Tài khoản bị khóa không kết nối được.
// - Ngắt kết nối khi access token hết hạn (15 phút): khóa tài khoản, đăng xuất có hiệu lực với socket trong tối đa
//   chừng đó thời gian. Client làm mới token rồi kết nối lại.
// - Origin phải nằm trong CORS_ORIGINS khi có header Origin (WebSocket không theo CORS; chặn trang lạ dùng cookie).
// - Redis adapter: phát sự kiện tới mọi instance API.
import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { AUTH_COOKIES, type AuthUser } from '@tps/shared';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import type { Logger } from '../lib/logger.js';
import type { TokenService } from '../modules/auth/tokens.js';

/** Đẩy sự kiện cho người dùng. Gọi sau khi transaction đã commit. */
export interface RealtimePublisher {
  emitToUser(userId: string, event: string, payload: unknown): void;
}

/** Không đẩy gì (test, tiến trình không có Socket.IO). */
export const noopRealtime: RealtimePublisher = { emitToUser: () => undefined };

export const userRoom = (userId: string) => `user:${userId}`;

/** Gắn vào socket sau khi xác thực. */
interface SocketData {
  userId: string;
  /** Hạn access token (ms). */
  expiresAt: number;
}

/** Giá trị một cookie trong header `Cookie`. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export interface RealtimeServer {
  publisher: RealtimePublisher;
  /** Ngắt mọi socket và đóng kết nối Redis của adapter (không đóng HTTP server). */
  close(): Promise<void>;
}

export function createRealtimeServer(deps: {
  httpServer: HttpServer;
  corsOrigins: string[];
  tokens: TokenService;
  loadUser: (userId: string) => Promise<AuthUser | null>;
  logger: Logger;
  /** Không có: một instance, adapter trong bộ nhớ (test). */
  redisUrl?: string;
}): RealtimeServer {
  const { logger } = deps;
  const io = new Server(deps.httpServer, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: deps.corsOrigins, credentials: true },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin === undefined || deps.corsOrigins.includes(origin));
    },
  });

  let pub: Redis | undefined;
  let sub: Redis | undefined;
  if (deps.redisUrl) {
    pub = new Redis(deps.redisUrl, { connectionName: 'tps-realtime-pub' });
    sub = pub.duplicate({ connectionName: 'tps-realtime-sub' });
    for (const client of [pub, sub]) {
      client.on('error', (err) => logger.warn({ err }, 'Realtime Redis connection error'));
    }
    io.adapter(createAdapter(pub, sub));
  }

  io.use((socket, next) => {
    const fromAuth: unknown = (socket.handshake.auth as Record<string, unknown>).token;
    const token =
      typeof fromAuth === 'string' && fromAuth.length > 0
        ? fromAuth
        : readCookie(socket.handshake.headers.cookie, AUTH_COOKIES.access);
    const claims = token ? deps.tokens.verifyAccessToken(token) : null;
    if (!claims) {
      next(new Error('unauthenticated'));
      return;
    }
    deps.loadUser(claims.userId).then(
      (user) => {
        if (!user || user.status === 'locked') {
          next(new Error('unauthenticated'));
          return;
        }
        const data: SocketData = { userId: user.id, expiresAt: claims.expiresAt.getTime() };
        socket.data = data;
        next();
      },
      (err: unknown) => {
        logger.warn({ err }, 'Realtime authentication failed');
        next(new Error('unavailable'));
      },
    );
  });

  io.on('connection', (socket) => {
    const { userId, expiresAt } = socket.data as SocketData;
    void socket.join(userRoom(userId));
    const remaining = expiresAt - Date.now();
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, remaining));
    timer.unref();
    socket.on('disconnect', () => clearTimeout(timer));
  });

  return {
    publisher: {
      emitToUser(userId, event, payload) {
        io.to(userRoom(userId)).emit(event, payload);
      },
    },
    async close() {
      io.disconnectSockets(true);
      await Promise.allSettled([pub?.quit(), sub?.quit()]);
    },
  };
}
