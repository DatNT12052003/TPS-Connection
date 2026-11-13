// Tài liệu OpenAPI sinh từ chính các Zod schema trong @tps/shared. Thêm endpoint: khai báo path ở đây.
import {
  ApiErrorBody,
  AuthSessionResponse,
  AuthUser,
  CodeSentResponse,
  EmailRequest,
  HealthReport,
  LoginRequest,
  PasswordResetConfirmRequest,
  RegisterRequest,
  VerifyEmailRequest,
} from '@tps/shared';
import { createDocument } from 'zod-openapi';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const error = (description: string) => ({ description, ...json(ApiErrorBody) });

/** Lỗi chung của endpoint có body: validation và rate limit. */
const commonErrors = {
  422: error('Dữ liệu không hợp lệ (validation_failed, kèm details theo từng trường)'),
  429: error('Thao tác quá nhanh (rate_limited, meta.retryAfterSeconds, header Retry-After)'),
};

const sessionSetCookie = {
  description:
    'Đăng nhập thành công. Access token và refresh token nằm trong cookie httpOnly tps_at, tps_rt (D57).',
  ...json(AuthSessionResponse),
};

export function createOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: { title: 'TPS-Connection API', version: '0.2.0' },
    components: {
      schemas: { ApiErrorBody, HealthReport, AuthUser },
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'tps_at' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Liveness: tiến trình API còn chạy',
          responses: { 200: { description: 'OK' } },
        },
      },
      '/health/ready': {
        get: {
          summary: 'Readiness: PostgreSQL, Redis, kho lưu tệp đều sẵn sàng',
          responses: {
            200: { description: 'Mọi phụ thuộc đều ổn', ...json(HealthReport) },
            503: { description: 'Ít nhất một phụ thuộc lỗi', ...json(HealthReport) },
          },
        },
      },
      '/api/v1/auth/register': {
        post: {
          tags: ['auth'],
          summary: 'Đăng ký phụ huynh hoặc gia sư; gửi mã xác thực email (chưa đăng nhập)',
          requestBody: json(RegisterRequest),
          responses: {
            201: { description: 'Đã tạo tài khoản, đã gửi mã', ...json(CodeSentResponse) },
            409: error('email_taken: email đã có tài khoản đã xác thực'),
            ...commonErrors,
          },
        },
      },
      '/api/v1/auth/email-verification/resend': {
        post: {
          tags: ['auth'],
          summary: 'Gửi lại mã xác thực (cùng kết quả dù email có tài khoản hay không)',
          requestBody: json(EmailRequest),
          responses: { 202: { description: 'OK', ...json(CodeSentResponse) }, ...commonErrors },
        },
      },
      '/api/v1/auth/email-verification/confirm': {
        post: {
          tags: ['auth'],
          summary: 'Nhập mã: xác thực email và đăng nhập',
          requestBody: json(VerifyEmailRequest),
          responses: {
            200: sessionSetCookie,
            400: error('invalid_code (meta.attemptsLeft), code_expired, code_attempts_exceeded'),
            ...commonErrors,
          },
        },
      },
      '/api/v1/auth/login': {
        post: {
          tags: ['auth'],
          summary: 'Đăng nhập bằng email và mật khẩu',
          requestBody: json(LoginRequest),
          responses: {
            200: sessionSetCookie,
            401: error('invalid_credentials'),
            403: error('email_not_verified, account_locked'),
            ...commonErrors,
          },
        },
      },
      '/api/v1/auth/refresh': {
        post: {
          tags: ['auth'],
          summary: 'Làm mới phiên bằng cookie tps_rt (xoay vòng refresh token)',
          responses: { 200: sessionSetCookie, 401: error('unauthenticated'), ...commonErrors },
        },
      },
      '/api/v1/auth/logout': {
        post: {
          tags: ['auth'],
          summary: 'Đăng xuất: thu hồi phiên, xóa cookie',
          responses: { 204: { description: 'Đã đăng xuất' } },
        },
      },
      '/api/v1/auth/password-reset/request': {
        post: {
          tags: ['auth'],
          summary: 'Gửi mã đặt lại mật khẩu (cùng kết quả dù email có tài khoản hay không)',
          requestBody: json(EmailRequest),
          responses: { 202: { description: 'OK', ...json(CodeSentResponse) }, ...commonErrors },
        },
      },
      '/api/v1/auth/password-reset/confirm': {
        post: {
          tags: ['auth'],
          summary: 'Đặt mật khẩu mới bằng mã; đăng xuất mọi thiết bị',
          requestBody: json(PasswordResetConfirmRequest),
          responses: {
            204: { description: 'Đã đổi mật khẩu' },
            400: error('invalid_code (meta.attemptsLeft), code_expired, code_attempts_exceeded'),
            ...commonErrors,
          },
        },
      },
      '/api/v1/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'Người dùng đang đăng nhập',
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: {
            200: { description: 'OK', ...json(AuthUser) },
            401: error('unauthenticated'),
            403: error('account_locked'),
          },
        },
      },
    },
  });
}
