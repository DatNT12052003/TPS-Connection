// Danh sách entity TypeORM. Thêm entity mới vào đây.
// Quy ước: mọi @Column ghi rõ `type` (không dựa vào emitDecoratorMetadata, xem tsconfig.json).
import { AuditLog } from '../modules/audit/audit-log.entity.js';
import { AuthSession } from '../modules/auth/auth-session.entity.js';
import {
  ClassEnrollmentRow,
  EnrollmentFeeRate,
  LearningGoalRow,
  TutoringClass,
} from '../modules/classes/class.entity.js';
import {
  ConnectionEventRow,
  ConnectionRequest,
  ConnectionTermsVersion,
} from '../modules/connections/connection.entity.js';
import {
  Conversation,
  ConversationParticipant,
  MessageAttachmentRow,
  MessageRow,
} from '../modules/messaging/conversation.entity.js';
import {
  NotificationPreferenceRow,
  NotificationRow,
} from '../modules/notifications/notification.entity.js';
import { ViolationReport } from '../modules/safety/violation-report.entity.js';
import { AdministrativeArea } from '../modules/catalog/administrative-area.entity.js';
import { GradeLevel } from '../modules/catalog/grade-level.entity.js';
import { Subject } from '../modules/catalog/subject.entity.js';
import { StoredFile } from '../modules/files/stored-file.entity.js';
import { LearnerGuardian } from '../modules/learners/learner-guardian.entity.js';
import { Learner } from '../modules/learners/learner.entity.js';
import { StudentInvitation } from '../modules/learners/student-invitation.entity.js';
import { ParentProfile } from '../modules/parents/parent-profile.entity.js';
import { TutorCredential } from '../modules/tutors/tutor-credential.entity.js';
import {
  TutorAvailabilitySlot,
  TutorServiceArea,
  TutorTeachingSubject,
} from '../modules/tutors/tutor-profile-items.entity.js';
import { TutorProfile } from '../modules/tutors/tutor-profile.entity.js';
import { RequestPost, RequestPostSlot } from '../modules/request-posts/request-post.entity.js';
import {
  TutorPost,
  TutorPostArea,
  TutorPostSlot,
  TutorPostSubject,
} from '../modules/tutor-posts/tutor-post.entity.js';
import { Role } from '../modules/users/role.entity.js';
import { AccountSanction } from '../modules/users/account-sanction.entity.js';
import { UserBlock } from '../modules/users/user-block.entity.js';
import { UserConsent } from '../modules/users/user-consent.entity.js';
import { UserRole } from '../modules/users/user-role.entity.js';
import { User } from '../modules/users/user.entity.js';
import { VerificationDocument } from '../modules/verification/verification-document.entity.js';
import { VerificationRequest } from '../modules/verification/verification-request.entity.js';

export const ENTITIES: (abstract new (...args: never[]) => unknown)[] = [
  // Danh mục
  Subject,
  GradeLevel,
  AdministrativeArea,
  // Tài khoản, phân quyền, tệp
  User,
  Role,
  UserRole,
  UserConsent,
  UserBlock,
  AccountSanction,
  AuthSession,
  StoredFile,
  // Hồ sơ phụ huynh và người học
  ParentProfile,
  Learner,
  LearnerGuardian,
  StudentInvitation,
  // Hồ sơ gia sư
  TutorProfile,
  TutorTeachingSubject,
  TutorServiceArea,
  TutorAvailabilitySlot,
  TutorCredential,
  // Xác minh gia sư
  VerificationRequest,
  VerificationDocument,
  // Nhật ký kiểm toán
  AuditLog,
  // Bài đăng marketplace (G4)
  TutorPost,
  TutorPostSubject,
  TutorPostArea,
  TutorPostSlot,
  RequestPost,
  RequestPostSlot,
  // Kết nối (G5)
  ConnectionRequest,
  ConnectionTermsVersion,
  ConnectionEventRow,
  // Nhắn tin (G5)
  Conversation,
  ConversationParticipant,
  MessageRow,
  MessageAttachmentRow,
  // Thông báo, báo cáo vi phạm (G5)
  NotificationRow,
  NotificationPreferenceRow,
  ViolationReport,
  // Lớp học (G6)
  TutoringClass,
  ClassEnrollmentRow,
  EnrollmentFeeRate,
  LearningGoalRow,
];
