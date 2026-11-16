// Phần server của trang bài tìm gia sư (tạo mới và sửa): dữ liệu cho form và action lưu, lưu rồi đăng.
import { LearnerList, OwnRequestPost } from '@tps/shared';
import { data, redirect, type RouterContextProvider } from 'react-router';
import { ApiError } from './api';
import { communesFor, loadCatalogs, loadCommunes } from './catalog.server';
import { type CatalogOption } from './catalog';
import { formErrorFrom, formText, type Message } from './form';
import { PATHS } from './navigation';
import {
  createRequestPostBody,
  type RequestPostField,
  requestPostBody,
  requestPostFieldErrors,
  type RequestPostValues,
  requestPostValuesFrom,
} from './posts-form';
import { readPreferences } from './preferences';
import { getServerApi } from './server-api.server';

type Context = Readonly<RouterContextProvider>;

export interface RequestPostActionFailure {
  ok: false;
  fieldErrors: Partial<Record<RequestPostField, Message>>;
  formError?: Message;
  values: RequestPostValues;
  communes: CatalogOption[];
}

/** Danh mục, con của phụ huynh và (khi sửa) bài; xã của tỉnh đang chọn. */
export async function loadRequestPostEditor(request: Request, context: Context, postId?: string) {
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);
  const [catalogs, learners, post] = await Promise.all([
    loadCatalogs(context, locale),
    api.call('/api/v1/learners', { schema: LearnerList }),
    postId
      ? api
          .call(`/api/v1/me/request-posts/${encodeURIComponent(postId)}`, {
            schema: OwnRequestPost,
          })
          .catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 404) {
              throw data(null, { status: 404 });
            }
            throw error;
          })
      : Promise.resolve(null),
  ]);
  if (post?.status === 'closed') throw redirect(PATHS.myRequests);
  const managed = learners.items.filter((l) => l.viewer === 'guardian');
  // Tạo mới từ trang của một con (`?learnerId=`): điền sẵn khối và khu vực của con.
  const preselected = postId
    ? undefined
    : managed.find((l) => l.id === new URL(request.url).searchParams.get('learnerId'));
  const provinceId = post?.provinceId ?? preselected?.provinceId ?? null;
  const communes = await loadCommunes(context, locale, provinceId).catch(() => []);
  return {
    ...catalogs,
    learners: post ? managed.filter((l) => l.id === post.learnerId) : managed,
    post,
    preselected: preselected ?? null,
    communes,
  };
}

/**
 * Lưu bài (tạo mới hoặc thay nội dung), rồi đăng nếu `intent = publish`. Tài khoản bị hạn chế thì lưu được mà
 * không đăng được: chuyển tới trang sửa kèm `?publish=<lỗi>`.
 */
export async function saveRequestPost(request: Request, context: Context, postId?: string) {
  const form = await request.formData();
  const values = requestPostValuesFrom(form);
  const publish = formText(form, 'intent') === 'publish';
  const api = getServerApi(context);

  let id = postId;
  try {
    const post = await api.call(
      id ? `/api/v1/me/request-posts/${encodeURIComponent(id)}` : '/api/v1/me/request-posts',
      {
        method: id ? 'PUT' : 'POST',
        body: id ? requestPostBody(values) : createRequestPostBody(values),
        schema: OwnRequestPost,
      },
    );
    id = post.id;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    // Chọn con không còn quản lý: API trả 404 như hồ sơ không tồn tại; báo ở ô "Cho con".
    const fieldErrors =
      error.status === 404 && !postId
        ? { learnerId: { key: 'validation.unknown_option' } as Message }
        : requestPostFieldErrors(error);
    return data<RequestPostActionFailure>({
      ok: false,
      fieldErrors,
      ...(error.code !== 'validation_failed' &&
        error.status !== 404 && { formError: formErrorFrom(error) }),
      values,
      communes: await communesFor(request, context, values.provinceId),
    });
  }

  if (publish) {
    try {
      await api.call(`/api/v1/me/request-posts/${id}/status`, {
        method: 'POST',
        body: { status: 'open' },
        schema: OwnRequestPost,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
      return redirect(`${PATHS.myRequests}/${id}/edit?publish=${error.code}`);
    }
  }
  return redirect(PATHS.myRequests);
}
