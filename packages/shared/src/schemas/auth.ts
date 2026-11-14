// Tài khoản và xác thực: schema request/response dùng chung cho API và form trên web (G2).
import { z } from 'zod';
import { Role, UserStatus } from '../statuses.js';
import { Email, Id, Locale, Password } from './common.js';

/** Quy tắc mã OTP qua email (D54). */
export const OTP_RULES = {
  length: 6,
  ttlSeconds: 10 * 60,
  maxAttempts: 5,
  resendCooldownSeconds: 45,
  maxSendsPerHour: 5,
} as const;

/** Thời hạn token. Refresh token "ghi nhớ đăng nhập" 30 ngày, không ghi nhớ 12 giờ. */
export const AUTH_TOKEN_TTL = {
  accessSeconds: 15 * 60,
  refreshRememberSeconds: 30 * 24 * 60 * 60,
  refreshSessionSeconds: 12 * 60 * 60,
} as const;

/** Tên cookie do API đặt (httpOnly). Web SSR đọc để chuyển tiếp tới API. */
export const AUTH_COOKIES = { access: 'tps_at', refresh: 'tps_rt' } as const;

/** Phiên bản điều khoản sử dụng và chính sách dữ liệu hiện hành, ghi vào `user_consents.version`. */
export const LEGAL_DOCUMENT_VERSION = '2026-11-13';

/** Mã OTP 6 chữ số. */
export const OtpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: 'invalid_code_format' });

/**
 * Số điện thoại Việt Nam tự khai (C12): bỏ khoảng trắng, dấu chấm, gạch; chấp nhận 0xxxxxxxxx hoặc +84xxxxxxxxx.
 */
export const PhoneNumber = z
  .string()
  .transform((value) => value.replace(/[\s.()-]/g, ''))
  .pipe(z.string().regex(/^(?:\+84|0)\d{9,10}$/, { error: 'invalid_phone' }));

/** Vai trò được tự đăng ký. Học sinh vào bằng lời mời của phụ huynh; Manager/Admin do Admin cấp. */
export const SelfRegisterRole = z.enum(['parent', 'tutor']);
export type SelfRegisterRole = z.infer<typeof SelfRegisterRole>;

const FullName = z.string().trim().min(1, { error: 'required' }).max(100, { error: 'too_long' });

export const RegisterRequest = z.object({
  role: SelfRegisterRole,
  fullName: FullName,
  email: Email,
  phone: z.union([z.literal('').transform(() => undefined), PhoneNumber]).optional(),
  password: Password,
  locale: Locale.default('vi'),
  acceptTerms: z.literal(true, { error: 'must_accept_terms' }),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const EmailRequest = z.object({ email: Email });
export type EmailRequest = z.infer<typeof EmailRequest>;

export const VerifyEmailRequest = z.object({ email: Email, code: OtpCode });
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequest>;

export const LoginRequest = z.object({
  email: Email,
  // Không áp quy tắc độ mạnh khi đăng nhập: chỉ cần khớp mật khẩu đã đặt.
  password: z.string().min(1, { error: 'required' }).max(128, { error: 'password_too_long' }),
  rememberMe: z.boolean().default(false),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const PasswordResetConfirmRequest = z.object({
  email: Email,
  code: OtpCode,
  newPassword: Password,
});
export type PasswordResetConfirmRequest = z.infer<typeof PasswordResetConfirmRequest>;

export const ChangePasswordRequest = z.object({
  currentPassword: z
    .string()
    .min(1, { error: 'required' })
    .max(128, { error: 'password_too_long' }),
  newPassword: Password,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

/** Một thiết bị/trình duyệt đang đăng nhập (một chuỗi phiên), cho màn Cài đặt > Bảo mật. */
export const ActiveSession = z.object({
  /** family id của chuỗi phiên. */
  id: Id,
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  /** Lần cuối phiên được dùng để làm mới token. */
  lastActiveAt: z.iso.datetime(),
  /** Phiên của chính request này ("máy này"). */
  current: z.boolean(),
});
export type ActiveSession = z.infer<typeof ActiveSession>;

/** Người dùng đang đăng nhập (chỉ trả cho chính người đó). */
export const AuthUser = z.object({
  id: Id,
  email: z.string(),
  displayName: z.string(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  locale: Locale,
  status: UserStatus,
  emailVerified: z.boolean(),
  roles: z.array(Role),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** Response khi đăng nhập / làm mới phiên: token nằm trong cookie, không có trong body. */
export const AuthSessionResponse = z.object({
  user: AuthUser,
  accessTokenExpiresAt: z.iso.datetime(),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponse>;

/** Response khi (có thể) đã gửi mã: luôn giống nhau dù email có tồn tại hay không. */
export const CodeSentResponse = z.object({
  resendAfterSeconds: z.int(),
  expiresInSeconds: z.int(),
});
export type CodeSentResponse = z.infer<typeof CodeSentResponse>;
