// Email đang chờ nhập mã xác thực (sau khi đăng ký, hoặc đăng nhập khi email chưa xác thực), giữ trong
// cookie httpOnly ngắn hạn thay vì đặt trên URL (email không lọt vào lịch sử trình duyệt, log máy chủ).
import { Email } from '@tps/shared';
import { createCookie } from 'react-router';
import { z } from 'zod';

const PendingVerification = z.object({
  email: Email,
  /** Thời điểm mã được gửi (ms), để tính giây còn phải chờ trước khi gửi lại. */
  sentAt: z.number().nullable(),
});
export type PendingVerification = z.infer<typeof PendingVerification>;

const cookie = createCookie('tps_pending_verification', {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60,
});

export async function readPendingVerification(
  request: Request,
): Promise<PendingVerification | null> {
  const value: unknown = await cookie.parse(request.headers.get('Cookie'));
  const parsed = PendingVerification.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function serializePendingVerification(value: PendingVerification): Promise<string> {
  return cookie.serialize(value);
}

export function clearPendingVerification(): Promise<string> {
  return cookie.serialize('', { maxAge: 0 });
}
