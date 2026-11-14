// Đọc hồ sơ con cho loader/action của các trang phụ huynh. Chỉ chạy trên server.
import { Learner, LearnerIdParams } from '@tps/shared';
import { data, type RouterContextProvider } from 'react-router';
import { ApiError } from './api';
import { getServerApi } from './server-api.server';
import { requireUser } from './session.server';

/** Id hồ sơ từ tham số URL; sai dạng thì 404 luôn, khỏi gọi API. */
export function learnerIdFrom(params: Record<string, string | undefined>): string {
  const parsed = LearnerIdParams.safeParse(params);
  if (!parsed.success) throw data(null, { status: 404 });
  return parsed.data.learnerId;
}

/**
 * Hồ sơ con mà phụ huynh đang đăng nhập quản lý. Không phải phụ huynh, không quản lý hoặc không tồn tại:
 * 404, giống API (không để lộ hồ sơ có tồn tại).
 */
export async function loadOwnLearner(
  request: Request,
  context: Readonly<RouterContextProvider>,
  learnerId: string,
): Promise<Learner> {
  await requireUser(request, context, { roles: ['parent'] });
  let learner: Learner;
  try {
    learner = await getServerApi(context).call(`/api/v1/learners/${learnerId}`, {
      schema: Learner,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') {
      throw data(null, { status: 404 });
    }
    throw error;
  }
  if (learner.viewer !== 'guardian') throw data(null, { status: 404 });
  return learner;
}
