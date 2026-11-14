// Danh sách entity TypeORM. Thêm entity mới vào đây.
// Quy ước: mọi @Column ghi rõ `type` (không dựa vào emitDecoratorMetadata, xem tsconfig.json).
import { AuditLog } from '../modules/audit/audit-log.entity.js';
import { AuthSession } from '../modules/auth/auth-session.entity.js';
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
import { Role } from '../modules/users/role.entity.js';
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
];
