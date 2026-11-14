import {
  AccountIdParams,
  AdminAccountsQuery,
  CatalogItemIdParams,
  CreateGradeLevelRequest,
  CreateSubjectRequest,
  GrantManagerRequest,
  LockAccountRequest,
  UpdateGradeLevelRequest,
  UpdateSubjectRequest,
} from '@tps/shared';
import { type RequestHandler, Router } from 'express';
import { requireRole } from '../../http/authorize.js';
import { validate } from '../../http/validate.js';
import type { AdminController } from './admin.controller.js';

/**
 * Khu Admin (C1), chỉ vai trò `admin` (Manager không vào được; Admin không vào được khu duyệt xác minh của
 * Manager). Gắn dưới /api/v1/admin, sau router /admin/verification-requests.
 *
 *   GET    /accounts?q=&role=&status=&page=          200  tìm tài khoản
 *   GET    /accounts/:userId                         200  chi tiết, lần khóa đang hiệu lực
 *   POST   /accounts/:userId/lock      { reason }    200  khóa (thu hồi mọi phiên)
 *   POST   /accounts/:userId/unlock                  200  mở khóa
 *   POST   /managers                   { email, fullName? }  201 tạo tài khoản mới / 200 tài khoản có sẵn
 *   DELETE /accounts/:userId/roles/manager           200  gỡ vai trò Manager
 *   GET    /catalog/subjects, /catalog/grade-levels  200  cả mục đã tắt, kèm số gia sư dạy
 *   POST   /catalog/subjects, /catalog/grade-levels  201  thêm
 *   PATCH  /catalog/subjects/:id, /grade-levels/:id  200  sửa tên, thứ tự, bật/tắt
 */
export function adminRouter(controller: AdminController, authenticate: RequestHandler): Router {
  const router = Router();
  const admin = [authenticate, requireRole('admin')];
  const account = validate({ params: AccountIdParams });

  router.get(
    '/accounts',
    ...admin,
    validate({ query: AdminAccountsQuery }),
    controller.listAccounts,
  );
  router.get('/accounts/:userId', ...admin, account, controller.getAccount);
  router.post(
    '/accounts/:userId/lock',
    ...admin,
    validate({ params: AccountIdParams, body: LockAccountRequest }),
    controller.lockAccount,
  );
  router.post('/accounts/:userId/unlock', ...admin, account, controller.unlockAccount);
  router.post(
    '/managers',
    ...admin,
    validate({ body: GrantManagerRequest }),
    controller.grantManager,
  );
  router.delete('/accounts/:userId/roles/manager', ...admin, account, controller.revokeManager);

  router.get('/catalog/subjects', ...admin, controller.listSubjects);
  router.post(
    '/catalog/subjects',
    ...admin,
    validate({ body: CreateSubjectRequest }),
    controller.createSubject,
  );
  router.patch(
    '/catalog/subjects/:id',
    ...admin,
    validate({ params: CatalogItemIdParams, body: UpdateSubjectRequest }),
    controller.updateSubject,
  );
  router.get('/catalog/grade-levels', ...admin, controller.listGradeLevels);
  router.post(
    '/catalog/grade-levels',
    ...admin,
    validate({ body: CreateGradeLevelRequest }),
    controller.createGradeLevel,
  );
  router.patch(
    '/catalog/grade-levels/:id',
    ...admin,
    validate({ params: CatalogItemIdParams, body: UpdateGradeLevelRequest }),
    controller.updateGradeLevel,
  );
  return router;
}
