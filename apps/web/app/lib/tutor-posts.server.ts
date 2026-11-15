// Phần server của trang soạn bài tuyển (tạo mới và sửa): dữ liệu cho form và action lưu, lưu rồi đăng.
import { OwnTutorPost, OwnTutorProfile } from '@tps/shared';
import { data, redirect, type RouterContextProvider } from 'react-router';
import { ApiError } from './api';
import type { AreaRef } from './catalog';
import { loadAreaRefs, loadCatalogs } from './catalog.server';
import { formErrorFrom, formText, type Message } from './form';
import { PATHS } from './navigation';
import {
  type TutorPostField,
  tutorPostBody,
  tutorPostFieldErrors,
  type TutorPostValues,
  tutorPostValuesFrom,
} from './posts-form';
import { readPreferences } from './preferences';
import { getServerApi } from './server-api.server';
import { parseServiceAreaIds } from './tutor-profile';

type Context = Readonly<RouterContextProvider>;

export interface TutorPostActionFailure {
  ok: false;
  fieldErrors: Partial<Record<TutorPostField, Message>>;
  formError?: Message;
  values: TutorPostValues;
  areas: AreaRef[];
}

/** Danh mục, trạng thái xác minh và (khi sửa) bài cùng khu vực đã chọn. */
export async function loadTutorPostEditor(request: Request, context: Context, postId?: string) {
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);
  const [catalogs, profile, post] = await Promise.all([
    loadCatalogs(context, locale),
    api.call('/api/v1/me/tutor-profile', { schema: OwnTutorProfile }),
    postId
      ? api
          .call(`/api/v1/me/tutor-posts/${encodeURIComponent(postId)}`, { schema: OwnTutorPost })
          .catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 404) {
              throw data(null, { status: 404 });
            }
            throw error;
          })
      : Promise.resolve(null),
  ]);
  if (post?.status === 'closed') throw redirect(PATHS.myPosts);
  const areas = post ? await loadAreaRefs(context, locale, post.areaIds) : [];
  return { ...catalogs, verified: profile.profileStatus === 'verified', post, areas, locale };
}

/**
 * Lưu bài (tạo mới hoặc thay nội dung), rồi đăng nếu `intent = publish`. Lưu được mà đăng không được (chưa xác
 * minh, thiếu thông tin): chuyển tới trang sửa của bài đã lưu kèm `?publish=<lỗi>` để hiện lý do.
 */
export async function saveTutorPost(request: Request, context: Context, postId?: string) {
  const form = await request.formData();
  const values = tutorPostValuesFrom(form);
  const publish = formText(form, 'intent') === 'publish';
  const api = getServerApi(context);

  let id = postId;
  try {
    const post = await api.call(
      id ? `/api/v1/me/tutor-posts/${encodeURIComponent(id)}` : '/api/v1/me/tutor-posts',
      { method: id ? 'PUT' : 'POST', body: tutorPostBody(values), schema: OwnTutorPost },
    );
    id = post.id;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    const { locale } = await readPreferences(request);
    const areas = await loadAreaRefs(
      context,
      locale,
      parseServiceAreaIds(values.areaIds).filter((n) => Number.isInteger(n) && n > 0),
    ).catch(() => []);
    return data<TutorPostActionFailure>({
      ok: false,
      fieldErrors: tutorPostFieldErrors(error),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
      areas,
    });
  }

  if (publish) {
    try {
      await api.call(`/api/v1/me/tutor-posts/${id}/status`, {
        method: 'POST',
        body: { status: 'open' },
        schema: OwnTutorPost,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
      return redirect(`${PATHS.myPosts}/${id}/edit?publish=${error.code}`);
    }
  }
  return redirect(PATHS.myPosts);
}

/** Lý do không đăng được (từ `?publish=`) thành thông điệp. */
export function publishErrorFrom(url: URL): Message | undefined {
  const code = url.searchParams.get('publish');
  if (!code) return undefined;
  if (code === 'validation_failed') return { key: 'myPosts.incomplete' };
  if (code === 'tutor_not_verified' || code === 'account_restricted') {
    return { key: `errors.${code}` };
  }
  return { key: 'errors.invalid_state_transition' };
}
