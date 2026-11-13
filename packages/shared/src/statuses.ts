// Enum nghiệp vụ, khai báo MỘT lần cho API, Web và Mobile.
// Giá trị khớp với các CHECK trong docs/thiet_ke_co_so_du_lieu.md; vòng đời và người được chuyển trạng thái
// ở docs/thuat_ngu_va_trang_thai.md (Phần B). Thêm/bớt giá trị thì sửa cả migration tương ứng.
//
// Mỗi enum là một z.enum: dùng làm validator (`LessonStatus.parse(x)`), lấy danh sách (`LessonStatus.options`),
// lấy một giá trị (`LessonStatus.enum.held`) và làm kiểu (`LessonStatus`).
import { z } from 'zod';

// ---- Tài khoản -------------------------------------------------------------------------------

/** `users.status` (B.9.3). */
export const UserStatus = z.enum(['active', 'restricted', 'locked']);
export type UserStatus = z.infer<typeof UserStatus>;

/** `roles.code`. Một người có thể có nhiều vai trò. */
export const Role = z.enum(['tutor', 'parent', 'student', 'manager', 'admin']);
export type Role = z.infer<typeof Role>;

/** Vai trò nhân viên vận hành (`roles.is_staff`), dùng khu vực `/admin`. */
export const STAFF_ROLES = [Role.enum.manager, Role.enum.admin] as const satisfies readonly Role[];

/** `user_consents.consent_type`: bằng chứng đồng ý xử lý dữ liệu. */
export const ConsentType = z.enum([
  'terms_of_service',
  'privacy_policy',
  'child_data_processing',
  'marketing_email',
]);
export type ConsentType = z.infer<typeof ConsentType>;

/** `auth_sessions.revoke_reason`: vì sao một phiên đăng nhập (chuỗi refresh token) bị thu hồi. */
export const AuthSessionRevokeReason = z.enum([
  'logout',
  'reuse_detected',
  'account_locked',
  'password_changed',
  'admin',
]);
export type AuthSessionRevokeReason = z.infer<typeof AuthSessionRevokeReason>;

// ---- Danh mục ---------------------------------------------------------------------------------

/** `grade_levels.stage`: cấp học, dùng để nhóm khối lớp. */
export const GradeStage = z.enum([
  'preschool',
  'primary',
  'lower_secondary',
  'upper_secondary',
  'university',
  'working_adult',
  'other',
]);
export type GradeStage = z.infer<typeof GradeStage>;

/** `administrative_areas.level`: hai cấp tỉnh – xã (sắp xếp năm 2025). */
export const AdministrativeLevel = z.enum(['province', 'commune']);
export type AdministrativeLevel = z.infer<typeof AdministrativeLevel>;

/**
 * `administrative_areas.unit_type`. Cấp tỉnh: `province` (tỉnh), `municipality` (thành phố trực thuộc
 * Trung ương). Cấp xã: `commune` (xã), `ward` (phường), `special_zone` (đặc khu).
 */
export const AdministrativeUnitType = z.enum([
  'province',
  'municipality',
  'commune',
  'ward',
  'special_zone',
]);
export type AdministrativeUnitType = z.infer<typeof AdministrativeUnitType>;

// ---- Hồ sơ gia sư và xác minh ----------------------------------------------------------------

/** `tutor_profiles.profile_status` (B.4.1). */
export const TutorProfileStatus = z.enum(['incomplete', 'pending_verification', 'verified']);
export type TutorProfileStatus = z.infer<typeof TutorProfileStatus>;

/** `verification_requests.kind`. */
export const VerificationRequestKind = z.enum(['identity', 'credential']);
export type VerificationRequestKind = z.infer<typeof VerificationRequestKind>;

/** `verification_requests.status` (B.4.2). */
export const VerificationRequestStatus = z.enum(['pending', 'approved', 'rejected', 'cancelled']);
export type VerificationRequestStatus = z.infer<typeof VerificationRequestStatus>;

/** `tutor_credentials.kind`. */
export const CredentialKind = z.enum(['degree', 'certificate', 'student_card']);
export type CredentialKind = z.infer<typeof CredentialKind>;

/** `tutor_credentials.verification_status`. */
export const CredentialVerificationStatus = z.enum([
  'self_declared',
  'pending',
  'verified',
  'rejected',
]);
export type CredentialVerificationStatus = z.infer<typeof CredentialVerificationStatus>;

// ---- Bài đăng ---------------------------------------------------------------------------------

/** `tutor_posts.status`, bài tuyển học sinh (B.2). */
export const TutorPostStatus = z.enum(['draft', 'open', 'paused', 'full', 'closed']);
export type TutorPostStatus = z.infer<typeof TutorPostStatus>;

/** `request_posts.status`, bài tìm gia sư (B.3). */
export const RequestPostStatus = z.enum(['draft', 'open', 'hidden', 'closed']);
export type RequestPostStatus = z.infer<typeof RequestPostStatus>;

/** `request_posts.closed_reason`. */
export const RequestPostClosedReason = z.enum(['found_tutor', 'no_longer_needed', 'other']);
export type RequestPostClosedReason = z.infer<typeof RequestPostClosedReason>;

/** Hình thức học. */
export const TeachingMode = z.enum(['online', 'in_person', 'hybrid']);
export type TeachingMode = z.infer<typeof TeachingMode>;

// ---- Kết nối ----------------------------------------------------------------------------------

/** `connection_requests.direction`. "Ứng tuyển" là `tutor_to_client`. */
export const ConnectionDirection = z.enum(['client_to_tutor', 'tutor_to_client']);
export type ConnectionDirection = z.infer<typeof ConnectionDirection>;

/** `connection_requests.status` (B.1). "Đã chấp nhận" là sự kiện (`accepted_at`), không phải trạng thái. */
export const ConnectionRequestStatus = z.enum([
  'pending',
  'negotiating',
  'confirmed',
  'rejected',
  'cancelled',
]);
export type ConnectionRequestStatus = z.infer<typeof ConnectionRequestStatus>;

/** `connection_requests.cancel_reason`; có giá trị khi và chỉ khi `status = cancelled`. */
export const ConnectionCancelReason = z.enum([
  'withdrawn',
  'ended_by_party',
  'source_closed',
  'expired_pending',
  'expired_negotiating',
]);
export type ConnectionCancelReason = z.infer<typeof ConnectionCancelReason>;

// ---- Lớp học ----------------------------------------------------------------------------------

/** `tutoring_classes.status` (B.5.1). Chỉ gia sư chuyển (D35). */
export const TutoringClassStatus = z.enum(['active', 'paused', 'ended']);
export type TutoringClassStatus = z.infer<typeof TutoringClassStatus>;

/** `class_enrollments.status` (B.5.2). */
export const EnrollmentStatus = z.enum(['active', 'paused', 'left']);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatus>;

/** `enrollment_fee_rates.status` (B.5.3). */
export const FeeRateStatus = z.enum(['proposed', 'active', 'rejected', 'superseded', 'withdrawn']);
export type FeeRateStatus = z.infer<typeof FeeRateStatus>;

// ---- Buổi học, điểm danh, khiếu nại ------------------------------------------------------------

/** `lessons.status` (B.6). */
export const LessonStatus = z.enum(['scheduled', 'held', 'cancelled', 'tutor_absent']);
export type LessonStatus = z.infer<typeof LessonStatus>;

/** `lesson_attendances.status` (B.7). */
export const AttendanceStatus = z.enum([
  'present',
  'absent_notified',
  'absent_no_show',
  'not_applicable',
]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

/** `lesson_attendances.confirmation_status` (B.7). */
export const AttendanceConfirmationStatus = z.enum([
  'pending',
  'confirmed',
  'auto_confirmed',
  'disputed',
  'resolved',
]);
export type AttendanceConfirmationStatus = z.infer<typeof AttendanceConfirmationStatus>;

/** Trạng thái xác nhận đã chốt: chỉ những buổi này mới được đưa vào bảng học phí (C5). */
export const SETTLED_CONFIRMATION_STATUSES = [
  AttendanceConfirmationStatus.enum.confirmed,
  AttendanceConfirmationStatus.enum.auto_confirmed,
  AttendanceConfirmationStatus.enum.resolved,
] as const satisfies readonly AttendanceConfirmationStatus[];

/** `attendance_disputes.status` (B.8). */
export const AttendanceDisputeStatus = z.enum([
  'open',
  'settled_by_parties',
  'escalated',
  'resolved_by_manager',
  'withdrawn',
]);
export type AttendanceDisputeStatus = z.infer<typeof AttendanceDisputeStatus>;

// ---- Học phí ----------------------------------------------------------------------------------

/** `fee_statements.status` (B.10.1). `draft` có trong thiết kế nhưng chưa dùng ở bản đầu (D40). */
export const FeeStatementStatus = z.enum(['draft', 'issued', 'partially_paid', 'paid', 'void']);
export type FeeStatementStatus = z.infer<typeof FeeStatementStatus>;

/** `payments.status` (B.10.2). Chỉ `acknowledged` được tính là đã trả (D41). */
export const PaymentStatus = z.enum(['recorded', 'acknowledged', 'voided']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/** `payments.method`. */
export const PaymentMethod = z.enum([
  'cash',
  'bank_transfer',
  'e_wallet',
  'online_gateway',
  'other',
]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

// ---- Kiểm duyệt -------------------------------------------------------------------------------

/** `violation_reports.status` (B.9.1). */
export const ViolationReportStatus = z.enum(['open', 'linked', 'closed']);
export type ViolationReportStatus = z.infer<typeof ViolationReportStatus>;

/** `moderation_cases.case_type`. `appeal` do Admin xử lý (C1). */
export const ModerationCaseType = z.enum(['violation', 'session_dispute', 'appeal']);
export type ModerationCaseType = z.infer<typeof ModerationCaseType>;

/** `moderation_cases.status` (B.9.2). */
export const ModerationCaseStatus = z.enum(['open', 'in_review', 'resolved', 'dismissed']);
export type ModerationCaseStatus = z.infer<typeof ModerationCaseStatus>;

/** `moderation_cases.decision`. */
export const ModerationDecision = z.enum([
  'no_action',
  'warning',
  'content_hidden',
  'account_restricted',
  'account_locked',
  'record_corrected',
]);
export type ModerationDecision = z.infer<typeof ModerationDecision>;

/** `account_sanctions.type`. */
export const SanctionType = z.enum(['warning', 'restriction', 'lock']);
export type SanctionType = z.infer<typeof SanctionType>;

/**
 * Các enum có nhãn hiển thị trong i18n, theo khóa `<tên camelCase>.<giá trị>` (ví dụ `lessonStatus.tutor_absent`).
 * Test kiểm tra mọi giá trị ở đây đều có nhãn ở cả vi và en.
 */
export const LABELLED_ENUMS = {
  userStatus: UserStatus,
  role: Role,
  consentType: ConsentType,
  gradeStage: GradeStage,
  tutorProfileStatus: TutorProfileStatus,
  verificationRequestKind: VerificationRequestKind,
  verificationRequestStatus: VerificationRequestStatus,
  credentialKind: CredentialKind,
  credentialVerificationStatus: CredentialVerificationStatus,
  tutorPostStatus: TutorPostStatus,
  requestPostStatus: RequestPostStatus,
  requestPostClosedReason: RequestPostClosedReason,
  teachingMode: TeachingMode,
  connectionDirection: ConnectionDirection,
  connectionRequestStatus: ConnectionRequestStatus,
  connectionCancelReason: ConnectionCancelReason,
  tutoringClassStatus: TutoringClassStatus,
  enrollmentStatus: EnrollmentStatus,
  feeRateStatus: FeeRateStatus,
  lessonStatus: LessonStatus,
  attendanceStatus: AttendanceStatus,
  attendanceConfirmationStatus: AttendanceConfirmationStatus,
  attendanceDisputeStatus: AttendanceDisputeStatus,
  feeStatementStatus: FeeStatementStatus,
  paymentStatus: PaymentStatus,
  paymentMethod: PaymentMethod,
  violationReportStatus: ViolationReportStatus,
  moderationCaseType: ModerationCaseType,
  moderationCaseStatus: ModerationCaseStatus,
  moderationDecision: ModerationDecision,
  sanctionType: SanctionType,
} as const;
