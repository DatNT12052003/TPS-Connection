// Danh sách migration, theo thứ tự thời gian. Tạo migration mới (xem README của API) rồi THÊM VÀO ĐÂY.
// Khai báo tường minh thay vì glob để dev (tsx), test (Jest) và bản build cùng nạp đúng một danh sách.
import { InitExtensions1794960000000 } from './1794960000000-InitExtensions.js';
import { CreateCatalogs1794970000000 } from './1794970000000-CreateCatalogs.js';
import { CreateAccounts1794970100000 } from './1794970100000-CreateAccounts.js';
import { AddAuthSessionRememberMe1794970200000 } from './1794970200000-AddAuthSessionRememberMe.js';
import { CreateParentLearnerProfiles1794970300000 } from './1794970300000-CreateParentLearnerProfiles.js';
import { CreateTutorProfiles1794970400000 } from './1794970400000-CreateTutorProfiles.js';
import { CreateVerification1794970500000 } from './1794970500000-CreateVerification.js';
import { CreateAuditLogs1794970600000 } from './1794970600000-CreateAuditLogs.js';

export const MIGRATIONS = [
  InitExtensions1794960000000,
  CreateCatalogs1794970000000,
  CreateAccounts1794970100000,
  AddAuthSessionRememberMe1794970200000,
  CreateParentLearnerProfiles1794970300000,
  CreateTutorProfiles1794970400000,
  CreateVerification1794970500000,
  CreateAuditLogs1794970600000,
];
