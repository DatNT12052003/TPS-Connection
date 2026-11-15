// Tài liệu OpenAPI sinh từ chính các Zod schema trong @tps/shared. Thêm endpoint: khai báo path ở đây.
import {
  AccountIdParams,
  AdminAccountDetail,
  AdminAccountList,
  AdminAccountsQuery,
  AdminGradeLevel,
  AdminSubject,
  CatalogItemIdParams,
  CreateGradeLevelRequest,
  CreateSubjectRequest,
  GrantManagerRequest,
  LockAccountRequest,
  UpdateGradeLevelRequest,
  UpdateSubjectRequest,
  DocumentViewUrl,
  RejectVerificationRequest,
  VerificationDocumentParams,
  VerificationQueue,
  VerificationQueueQuery,
  VerificationRequestDetail,
  VerificationRequestIdParams,
  OwnIdentityVerification,
  SubmitCredentialVerificationRequest,
  SubmitIdentityVerificationRequest,
  AccountProfile,
  CatalogArea,
  CatalogGradeLevel,
  CatalogSubject,
  catalogList,
  CreateTutorCredentialRequest,
  CredentialIdParams,
  OwnTutorProfile,
  ProvinceIdParams,
  PublicTutorProfile,
  SetAvatarRequest,
  TutorCredential,
  TutorIdParams,
  UpdateAccountRequest,
  UpdateTutorCredentialRequest,
  UpdateTutorProfileRequest,
  UploadRequest,
  UploadTicketResponse,
  AcceptStudentInvitationRequest,
  ActiveSession,
  ApiErrorBody,
  CreateLearnerRequest,
  CreateStudentInvitationRequest,
  Learner,
  LearnerIdParams,
  LearnerList,
  ParentProfile,
  PendingStudentInvitation,
  StudentInvitationLookupRequest,
  StudentInvitationPreview,
  UpdateLearnerRequest,
  UpdateParentProfileRequest,
  AuthSessionResponse,
  AuthUser,
  ChangePasswordRequest,
  CodeSentResponse,
  EmailRequest,
  HealthReport,
  LoginRequest,
  PasswordResetConfirmRequest,
  RegisterRequest,
  VerifyEmailRequest,
} from '@tps/shared';
import { z } from 'zod';
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

const security: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];

/** Chưa đăng nhập, hoặc không có vai trò cần thiết. */
const roleErrors = {
  401: error('unauthenticated'),
  403: error('forbidden: thiếu vai trò'),
};

/** Không có quyền theo quan hệ trả 404 như hồ sơ không tồn tại (không lộ hồ sơ có tồn tại hay không). */
const notVisible = error(
  'not_found: không tồn tại hoặc không phải phụ huynh quản lý / chính học sinh',
);

const invitationErrors = {
  404: error('invitation_invalid: không tồn tại, đã dùng, đã hủy'),
  410: error('invitation_expired: quá 7 ngày'),
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
      '/api/v1/auth/password/change': {
        post: {
          tags: ['auth'],
          summary: 'Đổi mật khẩu; đăng xuất các thiết bị khác, giữ thiết bị đang dùng (D50)',
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          requestBody: json(ChangePasswordRequest),
          responses: {
            204: { description: 'Đã đổi mật khẩu' },
            401: error('unauthenticated'),
            422: error('validation_failed; mật khẩu hiện tại sai: details[].code = wrong_password'),
            429: error('rate_limited: sai mật khẩu hiện tại 5 lần trong 15 phút'),
          },
        },
      },
      '/api/v1/auth/sessions': {
        get: {
          tags: ['auth'],
          summary: 'Thiết bị đang đăng nhập (mỗi chuỗi phiên một dòng)',
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: {
            200: { description: 'OK', ...json(z.object({ items: z.array(ActiveSession) })) },
            401: error('unauthenticated'),
          },
        },
      },
      '/api/v1/auth/sessions/revoke-others': {
        post: {
          tags: ['auth'],
          summary: 'Đăng xuất mọi thiết bị khác',
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: { 204: { description: 'Đã đăng xuất' }, 401: error('unauthenticated') },
        },
      },

      // ---- Hồ sơ phụ huynh, hồ sơ con, lời mời học sinh (G2 phần 4) ----
      '/api/v1/me/parent-profile': {
        get: {
          tags: ['parents'],
          summary: 'Hồ sơ của chính phụ huynh (trống nếu chưa lưu)',
          security,
          responses: { 200: { description: 'OK', ...json(ParentProfile) }, ...roleErrors },
        },
        put: {
          tags: ['parents'],
          summary: 'Tạo hoặc thay toàn bộ hồ sơ phụ huynh',
          security,
          requestBody: json(UpdateParentProfileRequest),
          responses: {
            200: { description: 'OK', ...json(ParentProfile) },
            ...roleErrors,
            422: error('validation_failed; xã không thuộc tỉnh: commune_not_in_province'),
          },
        },
      },
      '/api/v1/learners': {
        get: {
          tags: ['learners'],
          summary: 'Phụ huynh: các con đang quản lý. Học sinh: hồ sơ của chính mình',
          security,
          responses: { 200: { description: 'OK', ...json(LearnerList) }, ...roleErrors },
        },
        post: {
          tags: ['learners'],
          summary: 'Phụ huynh tạo hồ sơ con, kèm đồng ý xử lý dữ liệu của con',
          security,
          requestBody: json(CreateLearnerRequest),
          responses: {
            201: { description: 'Đã tạo', ...json(Learner) },
            ...roleErrors,
            422: error('validation_failed (chưa đồng ý, khối lớp hoặc tỉnh/xã không hợp lệ)'),
          },
        },
      },
      '/api/v1/learners/{learnerId}': {
        get: {
          tags: ['learners'],
          summary: 'Một hồ sơ con: chỉ phụ huynh quản lý hoặc chính học sinh',
          security,
          requestParams: { path: LearnerIdParams },
          responses: {
            200: { description: 'OK', ...json(Learner) },
            ...roleErrors,
            404: notVisible,
          },
        },
        patch: {
          tags: ['learners'],
          summary: 'Phụ huynh quản lý sửa hồ sơ (null xóa giá trị)',
          security,
          requestParams: { path: LearnerIdParams },
          requestBody: json(UpdateLearnerRequest),
          responses: {
            200: { description: 'OK', ...json(Learner) },
            ...roleErrors,
            404: notVisible,
            422: error('validation_failed'),
          },
        },
        delete: {
          tags: ['learners'],
          summary: 'Phụ huynh quản lý xóa mềm hồ sơ (rút đồng ý, hủy lời mời)',
          security,
          requestParams: { path: LearnerIdParams },
          responses: {
            204: { description: 'Đã xóa' },
            ...roleErrors,
            404: notVisible,
            409: error('conflict: hồ sơ đã có tài khoản học sinh'),
          },
        },
      },
      '/api/v1/learners/{learnerId}/invitation': {
        post: {
          tags: ['learners'],
          summary: 'Mời con tạo tài khoản học sinh: liên kết dùng một lần, 7 ngày (D50)',
          description: 'Lời mời đang mở trước đó bị hủy; chỉ liên kết mới nhất dùng được.',
          security,
          requestParams: { path: LearnerIdParams },
          requestBody: json(CreateStudentInvitationRequest),
          responses: {
            201: { description: 'Đã gửi email mời', ...json(PendingStudentInvitation) },
            ...roleErrors,
            404: notVisible,
            409: error('conflict: hồ sơ đã có tài khoản học sinh'),
            ...commonErrors,
          },
        },
        delete: {
          tags: ['learners'],
          summary: 'Hủy lời mời đang mở',
          security,
          requestParams: { path: LearnerIdParams },
          responses: {
            204: { description: 'Đã hủy' },
            ...roleErrors,
            404: error('not_found: không có quyền, hoặc không có lời mời đang mở'),
          },
        },
      },
      '/api/v1/student-invitations/lookup': {
        post: {
          tags: ['learners'],
          summary: 'Trang nhận lời mời: thông tin lời mời (không cần đăng nhập)',
          requestBody: json(StudentInvitationLookupRequest),
          responses: {
            200: { description: 'OK', ...json(StudentInvitationPreview) },
            ...invitationErrors,
            ...commonErrors,
          },
        },
      },
      '/api/v1/student-invitations/accept': {
        post: {
          tags: ['learners'],
          summary: 'Nhận lời mời: tạo tài khoản học sinh, gắn vào hồ sơ, đăng nhập',
          requestBody: json(AcceptStudentInvitationRequest),
          responses: {
            201: sessionSetCookie,
            ...invitationErrors,
            409: error('email_taken: email đã có tài khoản đã xác thực'),
            ...commonErrors,
          },
        },
      },

      // ---- Thông tin cá nhân, ảnh đại diện (G2 phần 5) ----
      '/api/v1/me': {
        get: {
          tags: ['account'],
          summary: 'Thông tin cá nhân của chính người dùng',
          security,
          responses: {
            200: { description: 'OK', ...json(AccountProfile) },
            401: error('unauthenticated'),
          },
        },
        patch: {
          tags: ['account'],
          summary: 'Sửa tên hiển thị, họ tên, số điện thoại (tự khai), ngôn ngữ',
          security,
          requestBody: json(UpdateAccountRequest),
          responses: {
            200: { description: 'OK', ...json(AccountProfile) },
            401: error('unauthenticated'),
            422: error('validation_failed; gia sư đã xác minh đổi họ tên: full_name_locked'),
          },
        },
      },
      '/api/v1/me/avatar': {
        put: {
          tags: ['account'],
          summary: 'Đặt ảnh đại diện bằng tệp đã tải lên (POST /files/uploads)',
          security,
          requestBody: json(SetAvatarRequest),
          responses: {
            200: { description: 'OK', ...json(AccountProfile) },
            401: error('unauthenticated'),
            422: error(
              'file_not_uploaded: tệp chưa lên kho, sai dung lượng/loại, hoặc không phải của bạn',
            ),
          },
        },
        delete: {
          tags: ['account'],
          summary: 'Bỏ ảnh đại diện',
          security,
          responses: { 204: { description: 'Đã bỏ' }, 401: error('unauthenticated') },
        },
      },
      '/api/v1/files/uploads': {
        post: {
          tags: ['account'],
          summary:
            'Cấp URL để trình duyệt PUT tệp thẳng lên kho (avatar: mọi người; verification_document, credential: chỉ gia sư)',
          security,
          requestBody: json(UploadRequest),
          responses: {
            201: { description: 'URL tải lên, hết hạn sau 5 phút', ...json(UploadTicketResponse) },
            401: error('unauthenticated'),
            ...commonErrors,
          },
        },
      },

      // ---- Hồ sơ gia sư (G2 phần 5) ----
      '/api/v1/me/tutor-profile': {
        get: {
          tags: ['tutors'],
          summary: 'Hồ sơ của chính gia sư (tạo hồ sơ trống nếu chưa có)',
          security,
          responses: { 200: { description: 'OK', ...json(OwnTutorProfile) }, ...roleErrors },
        },
        put: {
          tags: ['tutors'],
          summary: 'Thay toàn bộ hồ sơ gia sư (không đổi trạng thái hồ sơ)',
          security,
          requestBody: json(UpdateTutorProfileRequest),
          responses: {
            200: { description: 'OK', ...json(OwnTutorProfile) },
            ...roleErrors,
            422: error('validation_failed'),
          },
        },
      },
      '/api/v1/me/tutor-profile/credentials': {
        post: {
          tags: ['tutors'],
          summary: 'Thêm bằng cấp, chứng chỉ tự khai',
          security,
          requestBody: json(CreateTutorCredentialRequest),
          responses: {
            201: { description: 'Đã thêm', ...json(TutorCredential) },
            ...roleErrors,
            409: error('conflict: đã đủ 20 mục'),
            422: error('validation_failed'),
          },
        },
      },
      '/api/v1/me/tutor-profile/credentials/{credentialId}': {
        patch: {
          tags: ['tutors'],
          summary: 'Sửa bằng cấp tự khai (bị từ chối thì quay về tự khai)',
          security,
          requestParams: { path: CredentialIdParams },
          requestBody: json(UpdateTutorCredentialRequest),
          responses: {
            200: { description: 'OK', ...json(TutorCredential) },
            ...roleErrors,
            404: error('not_found'),
            409: error('invalid_state_transition: đang chờ duyệt hoặc đã xác minh'),
          },
        },
        delete: {
          tags: ['tutors'],
          summary: 'Xóa bằng cấp tự khai',
          security,
          requestParams: { path: CredentialIdParams },
          responses: {
            204: { description: 'Đã xóa' },
            ...roleErrors,
            404: error('not_found'),
            409: error('invalid_state_transition: đang chờ duyệt hoặc đã xác minh'),
          },
        },
      },
      '/api/v1/me/tutor-profile/verification': {
        get: {
          tags: ['verification'],
          summary:
            'Tình trạng xác minh danh tính của chính gia sư (yêu cầu gần nhất, giấy tờ bắt buộc)',
          security,
          responses: {
            200: { description: 'OK', ...json(OwnIdentityVerification) },
            ...roleErrors,
          },
        },
        post: {
          tags: ['verification'],
          summary:
            'Nộp giấy tờ danh tính (tệp tải trước qua POST /files/uploads, purpose verification_document); hồ sơ chuyển chờ xác minh',
          security,
          requestBody: json(SubmitIdentityVerificationRequest),
          responses: {
            201: { description: 'Đã nộp', ...json(OwnIdentityVerification) },
            ...roleErrors,
            409: error(
              'invalid_state_transition: hồ sơ thiếu trường bắt buộc, đang chờ duyệt hoặc đã xác minh',
            ),
            422: error(
              'validation_failed: thiếu giấy tờ, sai loại, tệp chưa tải xong, chưa đồng ý',
            ),
          },
        },
        delete: {
          tags: ['verification'],
          summary: 'Hủy yêu cầu xác minh danh tính đang chờ (ảnh bị xóa); hồ sơ về chưa hoàn thiện',
          security,
          responses: {
            204: { description: 'Đã hủy' },
            ...roleErrors,
            404: error('not_found: không có yêu cầu đang chờ'),
          },
        },
      },
      '/api/v1/me/tutor-profile/credentials/{credentialId}/verification': {
        post: {
          tags: ['verification'],
          summary:
            'Nộp 1–3 tệp của một bằng cấp để xác minh (purpose credential); bằng cấp chuyển chờ xác minh',
          security,
          requestParams: { path: CredentialIdParams },
          requestBody: json(SubmitCredentialVerificationRequest),
          responses: {
            201: { description: 'Đã nộp', ...json(TutorCredential) },
            ...roleErrors,
            404: error('not_found'),
            409: error('invalid_state_transition: đang chờ duyệt hoặc đã xác minh'),
            422: error('validation_failed: tệp chưa tải xong, sai mục đích, trùng'),
          },
        },
        delete: {
          tags: ['verification'],
          summary: 'Hủy yêu cầu xác minh bằng cấp đang chờ (ảnh bị xóa); bằng cấp về tự khai',
          security,
          requestParams: { path: CredentialIdParams },
          responses: {
            204: { description: 'Đã hủy' },
            ...roleErrors,
            404: error('not_found: không có yêu cầu đang chờ'),
          },
        },
      },
      '/api/v1/admin/verification-requests': {
        get: {
          tags: ['verification'],
          summary: 'Hàng chờ xác minh (Manager): yêu cầu đang chờ, sắp theo hạn duyệt',
          security,
          requestParams: { query: VerificationQueueQuery },
          responses: {
            200: { description: 'OK', ...json(VerificationQueue) },
            ...{
              401: error('unauthenticated'),
              403: error('forbidden: không phải Manager, hoặc hồ sơ của chính mình'),
            },
          },
        },
      },
      '/api/v1/admin/verification-requests/{requestId}': {
        get: {
          tags: ['verification'],
          summary: 'Màn duyệt một yêu cầu (không có URL ảnh)',
          security,
          requestParams: { path: VerificationRequestIdParams },
          responses: {
            200: { description: 'OK', ...json(VerificationRequestDetail) },
            ...{
              401: error('unauthenticated'),
              403: error('forbidden: không phải Manager, hoặc hồ sơ của chính mình'),
            },
            404: error('not_found'),
          },
        },
      },
      '/api/v1/admin/verification-requests/{requestId}/documents/{documentId}/view': {
        post: {
          tags: ['verification'],
          summary:
            'URL xem một giấy tờ, sống 2 phút; ghi nhật ký kiểm toán; chỉ khi yêu cầu đang chờ',
          security,
          requestParams: { path: VerificationDocumentParams },
          responses: {
            200: { description: 'OK (Cache-Control: no-store)', ...json(DocumentViewUrl) },
            ...{
              401: error('unauthenticated'),
              403: error('forbidden: không phải Manager, hoặc hồ sơ của chính mình'),
            },
            404: error('not_found'),
            409: error('invalid_state_transition: yêu cầu đã được xử lý'),
          },
        },
      },
      '/api/v1/admin/verification-requests/{requestId}/approve': {
        post: {
          tags: ['verification'],
          summary: 'Duyệt; ảnh giấy tờ xóa sau 30 ngày; email kết quả cho gia sư',
          security,
          requestParams: { path: VerificationRequestIdParams },
          responses: {
            200: { description: 'OK', ...json(VerificationRequestDetail) },
            ...{
              401: error('unauthenticated'),
              403: error('forbidden: không phải Manager, hoặc hồ sơ của chính mình'),
            },
            404: error('not_found'),
            409: error('invalid_state_transition: yêu cầu đã được xử lý'),
          },
        },
      },
      '/api/v1/admin/verification-requests/{requestId}/reject': {
        post: {
          tags: ['verification'],
          summary: 'Từ chối kèm lý do (lý do "other" bắt buộc ghi chú); email kết quả cho gia sư',
          security,
          requestParams: { path: VerificationRequestIdParams },
          requestBody: json(RejectVerificationRequest),
          responses: {
            200: { description: 'OK', ...json(VerificationRequestDetail) },
            ...{
              401: error('unauthenticated'),
              403: error('forbidden: không phải Manager, hoặc hồ sơ của chính mình'),
            },
            404: error('not_found'),
            409: error('invalid_state_transition: yêu cầu đã được xử lý'),
            422: error('validation_failed'),
          },
        },
      },
      '/api/v1/admin/accounts': {
        get: {
          tags: ['admin'],
          summary: 'Tìm tài khoản theo tên (không dấu), email, vai trò, trạng thái',
          security,
          requestParams: { query: AdminAccountsQuery },
          responses: {
            200: { description: 'OK', ...json(AdminAccountList) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
          },
        },
      },
      '/api/v1/admin/accounts/{userId}': {
        get: {
          tags: ['admin'],
          summary: 'Chi tiết tài khoản, lần khóa đang hiệu lực',
          security,
          requestParams: { path: AccountIdParams },
          responses: {
            200: { description: 'OK', ...json(AdminAccountDetail) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            404: error('not_found'),
          },
        },
      },
      '/api/v1/admin/accounts/{userId}/lock': {
        post: {
          tags: ['admin'],
          summary: 'Khóa tài khoản kèm lý do; thu hồi mọi phiên; không khóa chính mình hay Admin',
          security,
          requestParams: { path: AccountIdParams },
          requestBody: json(LockAccountRequest),
          responses: {
            200: { description: 'OK', ...json(AdminAccountDetail) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            404: error('not_found'),
            409: error('conflict: đã khóa hoặc đã xóa'),
          },
        },
      },
      '/api/v1/admin/accounts/{userId}/unlock': {
        post: {
          tags: ['admin'],
          summary: 'Mở khóa tài khoản',
          security,
          requestParams: { path: AccountIdParams },
          responses: {
            200: { description: 'OK', ...json(AdminAccountDetail) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            404: error('not_found'),
            409: error('conflict: chưa bị khóa'),
          },
        },
      },
      '/api/v1/admin/managers': {
        post: {
          tags: ['admin'],
          summary:
            'Gán vai trò Manager theo email; email mới thì tạo tài khoản không mật khẩu (cần họ tên)',
          security,
          requestBody: json(GrantManagerRequest),
          responses: {
            200: { description: 'Gán cho tài khoản có sẵn', ...json(AdminAccountDetail) },
            201: { description: 'Tạo tài khoản mới', ...json(AdminAccountDetail) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            409: error('conflict: đã là Manager'),
            422: error('validation_failed'),
          },
        },
      },
      '/api/v1/admin/accounts/{userId}/roles/manager': {
        delete: {
          tags: ['admin'],
          summary: 'Gỡ vai trò Manager',
          security,
          requestParams: { path: AccountIdParams },
          responses: {
            200: { description: 'OK', ...json(AdminAccountDetail) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            404: error('not_found'),
          },
        },
      },
      '/api/v1/admin/catalog/subjects': {
        get: {
          tags: ['admin'],
          summary: 'Môn học (cả môn đã tắt), kèm số gia sư dạy',
          security,
          responses: {
            200: { description: 'OK', ...json(z.object({ items: z.array(AdminSubject) })) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
          },
        },
        post: {
          tags: ['admin'],
          summary: 'Thêm môn học',
          security,
          requestBody: json(CreateSubjectRequest),
          responses: {
            201: { description: 'OK', ...json(AdminSubject) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            422: error('validation_failed: mã sai dạng hoặc đã có'),
          },
        },
      },
      '/api/v1/admin/catalog/subjects/{id}': {
        patch: {
          tags: ['admin'],
          summary: 'Sửa tên, thứ tự, bật/tắt môn học',
          security,
          requestParams: { path: CatalogItemIdParams },
          requestBody: json(UpdateSubjectRequest),
          responses: {
            200: { description: 'OK', ...json(AdminSubject) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            404: error('not_found'),
          },
        },
      },
      '/api/v1/admin/catalog/grade-levels': {
        get: {
          tags: ['admin'],
          summary: 'Khối lớp (cả khối đã tắt), kèm số gia sư dạy',
          security,
          responses: {
            200: { description: 'OK', ...json(z.object({ items: z.array(AdminGradeLevel) })) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
          },
        },
        post: {
          tags: ['admin'],
          summary: 'Thêm khối lớp',
          security,
          requestBody: json(CreateGradeLevelRequest),
          responses: {
            201: { description: 'OK', ...json(AdminGradeLevel) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            422: error('validation_failed: mã sai dạng hoặc đã có'),
          },
        },
      },
      '/api/v1/admin/catalog/grade-levels/{id}': {
        patch: {
          tags: ['admin'],
          summary: 'Sửa tên, thứ tự, bật/tắt khối lớp',
          security,
          requestParams: { path: CatalogItemIdParams },
          requestBody: json(UpdateGradeLevelRequest),
          responses: {
            200: { description: 'OK', ...json(AdminGradeLevel) },
            ...{ 401: error('unauthenticated'), 403: error('forbidden: không phải Admin') },
            404: error('not_found'),
          },
        },
      },
      '/api/v1/tutors/{tutorId}': {
        get: {
          tags: ['tutors'],
          summary:
            'Hồ sơ gia sư công khai (khách xem được; không có email, số điện thoại, họ tên thật)',
          requestParams: { path: TutorIdParams },
          responses: {
            200: { description: 'OK', ...json(PublicTutorProfile) },
            404: error(
              'not_found: không tồn tại, chưa xác minh danh tính, bị hạn chế/khóa hoặc đã xóa',
            ),
          },
        },
      },

      // ---- Danh mục (công khai) ----
      '/api/v1/catalog/subjects': {
        get: {
          tags: ['catalog'],
          summary: 'Môn học đang dùng',
          responses: { 200: { description: 'OK', ...json(catalogList(CatalogSubject)) } },
        },
      },
      '/api/v1/catalog/grade-levels': {
        get: {
          tags: ['catalog'],
          summary: 'Khối lớp, cấp học đang dùng',
          responses: { 200: { description: 'OK', ...json(catalogList(CatalogGradeLevel)) } },
        },
      },
      '/api/v1/catalog/provinces': {
        get: {
          tags: ['catalog'],
          summary: 'Tỉnh, thành phố',
          responses: { 200: { description: 'OK', ...json(catalogList(CatalogArea)) } },
        },
      },
      '/api/v1/catalog/provinces/{provinceId}/communes': {
        get: {
          tags: ['catalog'],
          summary: 'Xã, phường, đặc khu của một tỉnh',
          requestParams: { path: ProvinceIdParams },
          responses: {
            200: { description: 'OK', ...json(catalogList(CatalogArea)) },
            404: error('not_found: tỉnh không tồn tại'),
          },
        },
      },
    },
  });
}
