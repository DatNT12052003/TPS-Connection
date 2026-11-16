// /app/requests: bài tìm gia sư của phụ huynh (canvas NeedPost, khối "Bài đang mở của bạn"; ParentHome). Mỗi bài có
// các nút theo sơ đồ B.3: sửa, đăng, ẩn, hiện lại, đóng (chọn lý do), xóa. Các nút gửi form tới action của trang
// (intent `status|delete`). Số gia sư ứng tuyển có ở G5.
import {
  LearnerList,
  OwnRequestPost,
  OwnRequestPostList,
  RequestPostClosedReason,
  type RequestPostStatus,
} from '@tps/shared';
import { Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, useNavigation } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Pagination } from '~/components/marketplace/pagination';
import { Alert } from '~/components/ui/alert';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { SelectField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { labelOf } from '~/lib/catalog';
import { loadCatalogs } from '~/lib/catalog.server';
import { formatDate } from '~/lib/format';
import { formErrorFrom, formText, type Message } from '~/lib/form';
import { learnerName } from '~/lib/learners';
import { budgetLabel, pageCount } from '~/lib/marketplace';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/index';

const PAGE_SIZE = 20;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.requestPosts.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);
  const [list, learners, catalogs] = await Promise.all([
    api.call(`/api/v1/me/request-posts?page=${page}&pageSize=${PAGE_SIZE}`, {
      schema: OwnRequestPostList,
    }),
    api.call('/api/v1/learners', { schema: LearnerList }),
    loadCatalogs(context, locale),
  ]);
  return {
    list,
    learnerNames: Object.fromEntries(learners.items.map((l) => [l.id, learnerName(l)])),
    catalogs,
  };
}

interface ActionFailure {
  ok: false;
  postId: string;
  formError: Message;
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const form = await request.formData();
  const intent = formText(form, 'intent');
  const postId = formText(form, 'postId');
  const api = getServerApi(context);
  const path = `/api/v1/me/request-posts/${encodeURIComponent(postId)}`;
  try {
    if (intent === 'status') {
      const status = formText(form, 'status');
      await api.call(`${path}/status`, {
        method: 'POST',
        body: {
          status,
          ...(status === 'closed' && { closedReason: formText(form, 'closedReason') }),
        },
        schema: OwnRequestPost,
      });
      return { ok: true as const };
    }
    if (intent === 'delete') {
      await api.call(path, { method: 'DELETE' });
      return { ok: true as const };
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<ActionFailure>({ ok: false, postId, formError: formErrorFrom(error) });
  }
  throw data(null, { status: 400 });
}

const STATUS_BADGE: Record<RequestPostStatus, BadgeProps['variant']> = {
  draft: 'neutral',
  open: 'success',
  hidden: 'warning',
  closed: 'neutral',
};

/** Lý do đóng phụ huynh chọn được; "đã tìm được gia sư" do hệ thống đặt khi xác nhận hợp tác (D31). */
const CLOSE_REASONS = RequestPostClosedReason.exclude(['found_tutor']).options;

export default function MyRequestPostsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const { list, learnerNames, catalogs } = loaderData;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const busyPost = navigation.state !== 'idle' ? navigation.formData?.get('postId') : undefined;
  const confirmOn = (message: string) => (event: FormEvent) => {
    if (!window.confirm(message)) event.preventDefault();
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t('requestPosts.title')}</h1>
          <p className="text-muted-foreground">{t('requestPosts.lead')}</p>
        </div>
        <Link to={PATHS.newRequest} className={buttonVariants()}>
          <Plus aria-hidden="true" />
          {t('requestPosts.create')}
        </Link>
      </div>

      {list.items.length === 0 ? (
        <Card className="items-start">
          <h2 className="text-h3">{t('requestPosts.emptyTitle')}</h2>
          <p className="text-muted-foreground">{t('requestPosts.emptyBody')}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((post) => {
            const busy = busyPost === post.id;
            const title = t('requestPosts.postTitle', {
              subject: labelOf(catalogs.subjects, post.subjectId) ?? '',
              child: learnerNames[post.learnerId] ?? '',
            });
            const statusButton = (to: RequestPostStatus, label: string) => (
              <Form method="post">
                <input type="hidden" name="intent" value="status" />
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="status" value={to} />
                <Button type="submit" variant="ghost" disabled={busy}>
                  {label}
                </Button>
              </Form>
            );
            return (
              <li key={post.id}>
                <Card className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {post.status === 'closed' ? (
                          <span className="font-semibold">{title}</span>
                        ) : (
                          <Link
                            to={`${PATHS.myRequests}/${post.id}/edit`}
                            className="font-semibold text-foreground hover:text-primary"
                          >
                            {title}
                          </Link>
                        )}
                        <Badge variant={STATUS_BADGE[post.status]} dot={post.status === 'open'}>
                          {t(`requestPostStatus.${post.status}`)}
                        </Badge>
                        {post.moderationHidden && (
                          <Badge variant="danger">{t('myPosts.hiddenByModerator')}</Badge>
                        )}
                      </div>
                      <span className="text-small text-muted-foreground">
                        {[
                          labelOf(catalogs.grades, post.gradeLevelId),
                          t(`requestPostGoal.${post.goal}`),
                          t(`teachingMode.${post.teachingMode}`),
                          post.budget && budgetLabel(t, i18n.language, post.budget),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="text-small text-muted-foreground">
                        {post.status === 'closed' && post.closedReason
                          ? t(`requestPostClosedReason.${post.closedReason}`)
                          : post.publishedAt
                            ? t('myPosts.publishedOn', {
                                date: formatDate(post.publishedAt, i18n.language),
                              })
                            : t('myPosts.editedOn', {
                                date: formatDate(post.updatedAt, i18n.language),
                              })}
                      </span>
                      {failure?.postId === post.id && (
                        <span role="alert" className="text-small font-medium text-danger">
                          {tr(failure.formError)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {post.status !== 'closed' && (
                        <Link
                          to={`${PATHS.myRequests}/${post.id}/edit`}
                          className={buttonVariants({ variant: 'ghost' })}
                        >
                          {t('myPosts.edit')}
                        </Link>
                      )}
                      {post.status === 'draft' && statusButton('open', t('myPosts.publish'))}
                      {post.status === 'open' && statusButton('hidden', t('requestPosts.hide'))}
                      {post.status === 'hidden' && statusButton('open', t('requestPosts.show'))}
                      {(post.status === 'draft' || post.status === 'closed') && (
                        <Form
                          method="post"
                          onSubmit={confirmOn(t('requestPosts.confirmDelete', { title }))}
                        >
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="postId" value={post.id} />
                          <Button type="submit" variant="ghost" disabled={busy}>
                            {t('myPosts.delete')}
                          </Button>
                        </Form>
                      )}
                    </div>
                  </div>
                  {(post.status === 'open' || post.status === 'hidden') && (
                    <details className="group">
                      <summary className="cursor-pointer text-small font-semibold text-primary">
                        {t('requestPosts.close')}
                      </summary>
                      <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="intent" value="status" />
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="status" value="closed" />
                        <SelectField
                          name="closedReason"
                          label={t('requestPosts.closeReason')}
                          className="min-w-56"
                          defaultValue="no_longer_needed"
                        >
                          {CLOSE_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {t(`requestPostClosedReason.${r}`)}
                            </option>
                          ))}
                        </SelectField>
                        <Button type="submit" variant="secondary" disabled={busy}>
                          {t('requestPosts.closeConfirm')}
                        </Button>
                      </Form>
                    </details>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount(list.total, PAGE_SIZE) > 1 && (
        <Pagination
          pathname={PATHS.myRequests}
          params={new URLSearchParams()}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          maxPage={Number.MAX_SAFE_INTEGER}
        />
      )}

      <Alert variant="info">{t('requestPosts.help')}</Alert>
    </PageContainer>
  );
}
