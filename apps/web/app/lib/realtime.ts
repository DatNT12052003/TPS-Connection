// Realtime trong trình duyệt (G5): một kết nối Socket.IO cho cả khu /app. Server chỉ đẩy sự kiện (REALTIME_EVENTS);
// khi có sự kiện, trang tải lại dữ liệu của mình bằng loader (revalidate), nên mọi số liệu vẫn đi qua BFF và API.
//
// - Kết nối cùng origin với web (`/socket.io`): dev server Vite chuyển tiếp tới API (vite.config.ts), khi triển khai
//   reverse proxy làm việc đó. Nhờ vậy trình duyệt gửi kèm cookie phiên httpOnly `tps_at` mà JavaScript không đọc.
// - API ngắt kết nối khi access token hết hạn (15 phút). Khi đó gọi `/app/realtime/session` (server web làm mới phiên,
//   đặt cookie mới) rồi kết nối lại; tối đa một lần mỗi 30 giây.
import { type ConversationReadEvent, REALTIME_EVENTS } from '@tps/shared';
import { useEffect, useRef } from 'react';
import { useRevalidator } from 'react-router';
import { io } from 'socket.io-client';
import { PATHS } from './navigation';

const REFRESH_EVERY_MS = 30_000;
const REVALIDATE_DELAY_MS = 250;

export function useRealtimeRevalidation(enabled: boolean): void {
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  useEffect(() => {
    revalidate.current = revalidator.revalidate;
  });

  useEffect(() => {
    if (!enabled) return;
    const socket = io({ path: '/socket.io', transports: ['websocket'], withCredentials: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRefresh = 0;

    // Gom nhiều sự kiện liền nhau thành một lần tải lại.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void revalidate.current(), REVALIDATE_DELAY_MS);
    };
    const reconnectWithFreshSession = async () => {
      if (Date.now() - lastRefresh < REFRESH_EVERY_MS) return;
      lastRefresh = Date.now();
      const ok = await fetch(PATHS.realtimeSession, { credentials: 'same-origin' })
        .then((res) => res.ok)
        .catch(() => false);
      if (ok) socket.connect();
    };

    for (const event of [
      REALTIME_EVENTS.notificationNew,
      REALTIME_EVENTS.messageNew,
      REALTIME_EVENTS.messageDeleted,
      REALTIME_EVENTS.conversationOpened,
    ]) {
      socket.on(event, refresh);
    }
    // Chính mình đọc thì trang đã biết; chỉ tải lại khi bên kia đọc (hiện "Đã xem").
    socket.on(REALTIME_EVENTS.conversationRead, (event: ConversationReadEvent) => {
      if (!event.isMine) refresh();
    });
    socket.on('connect_error', (error) => {
      if (error.message === 'unauthenticated') void reconnectWithFreshSession();
    });
    socket.on('disconnect', (reason) => {
      // Server ngắt (token hết hạn) thì client không tự kết nối lại.
      if (reason === 'io server disconnect') void reconnectWithFreshSession();
    });
    // Kết nối lại sau khi mất mạng: có thể đã lỡ sự kiện.
    socket.io.on('reconnect', refresh);

    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [enabled]);
}
