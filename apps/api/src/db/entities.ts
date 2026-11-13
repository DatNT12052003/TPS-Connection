// Danh sách entity TypeORM. Thêm entity mới vào đây.
// Quy ước: mọi @Column ghi rõ `type` (không dựa vào emitDecoratorMetadata, xem tsconfig.json).
import { AuthSession } from '../modules/auth/auth-session.entity.js';
import { AdministrativeArea } from '../modules/catalog/administrative-area.entity.js';
import { GradeLevel } from '../modules/catalog/grade-level.entity.js';
import { Subject } from '../modules/catalog/subject.entity.js';
import { StoredFile } from '../modules/files/stored-file.entity.js';
import { Role } from '../modules/users/role.entity.js';
import { UserBlock } from '../modules/users/user-block.entity.js';
import { UserConsent } from '../modules/users/user-consent.entity.js';
import { UserRole } from '../modules/users/user-role.entity.js';
import { User } from '../modules/users/user.entity.js';

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
];
