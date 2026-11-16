// /app/posts: bài tuyển học sinh của gia sư (canvas MyPosts, MyPostsMobile). Lọc theo trạng thái bằng tab (liên kết
// `?status=`). Mỗi bài có các nút theo sơ đồ B.2: sửa, đăng, tạm dừng, mở lại, đủ học sinh, đóng, nhân bản (D33),
// xóa. Các nút gửi form tới action của trang này (intent `status|duplicate|delete`). Số yêu cầu phát sinh từ bài
// có ở G5.
import { OwnTutorPost, OwnTutorPostList, OwnTutorProfile, TutorPostStatus } from '@tps/shared';
import { Plus } from 'lucide-react';
import type { ParseKeys } from 'i18next';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Pagination } from '~/components/marketplace/pagination';
import { Alert } from '~/components/ui/alert';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ApiError } from '~/lib/api';
import { loadCatalogs } from '~/lib/catalog.server';
import { formatDate } from '~/lib/format';
import { formErrorFrom, formText, type Message } from '~/lib/form';
import { pageCount, summarizeSubjects } from '~/lib/marketplace';
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
  return [{ title: `${m.myPosts.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const url = new URL(request.url);
  const status = TutorPostStatus.safeParse(url.searchParams.get('status'));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status.success) query.set('status', status.data);
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);
  const [list, profile, catalogs] = await Promise.all([
    api.call(`/api/v1/me/tutor-posts?${query}`, { schema: OwnTutorPostList }),
    api.call('/api/v1/me/tutor-profile', { schema: OwnTutorProfile }),
    loadCatalogs(context, locale),
  ]);
  return {
    list,
    status: status.success ? status.data : null,
    verified: profile.profileStatus === 'verified',
    catalogs,
  };
}

interface ActionFailure {
  ok: false;
  postId: string;
  formError: Message;
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const form = await request.formData();
  const intent = formText(form, 'intent');
  const postId = formText(form, 'postId');
  const api = getServerApi(context);
  const path = `/api/v1/me/tutor-posts/${encodeURIComponent(postId)}`;
  try {
    if (intent === 'status') {
      await api.call(`${path}/status`, {
        method: 'POST',
        body: { status: formText(form, 'status') },
        schema: OwnTutorPost,
      });
      return { ok: true as const };
    }
    if (intent === 'duplicate') {
      const copy = await api.call(`${path}/duplicate`, { method: 'POST', schema: OwnTutorPost });
      return redirect(`${PATHS.myPosts}/${copy.id}/edit?copied=1`);
    }
    if (intent === 'delete') {
      await api.call(path, { method: 'DELETE' });
      return { ok: true as const };
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    // Mở bài chưa đủ thông tin (422): chỉ ra cần sửa bài, không liệt kê từng ô ở danh sách.
    const formError: Message =
      error.code === 'validation_failed' ? { key: 'myPosts.incomplete' } : formErrorFrom(error);
    return data<ActionFailure>({ ok: false, postId, formError });
  }
  throw data(null, { status: 400 });
}

const STATUS_BADGE: Record<TutorPostStatus, BadgeProps['variant']> = {
  draft: 'neutral',
  open: 'success',
  paused: 'warning',
  full: 'verified',
  closed: 'neutral',
};

/** Nút đổi trạng thái theo B.2 cho từng trạng thái hiện tại. */
const STATUS_ACTIONS: Record<TutorPostStatus, { to: TutorPostStatus; label: ParseKeys }[]> = {
  draft: [{ to: 'open', label: 'myPosts.publish' }],
  open: [
    { to: 'paused', label: 'myPosts.pause' },
    { to: 'full', label: 'myPosts.markFull' },
    { to: 'closed', label: 'myPosts.close' },
  ],
  paused: [
    { to: 'open', label: 'myPosts.resume' },
    { to: 'closed', label: 'myPosts.close' },
  ],
  full: [
    { to: 'open', label: 'myPosts.reopen' },
    { to: 'closed', label: 'myPosts.close' },
  ],
  closed: [],
};

const TABS = [null, 'open', 'draft', 'paused', 'full', 'closed'] as const;

export default function MyPostsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const { list, status, verified, catalogs } = loaderData;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const busyPost = navigation.state !== 'idle' ? navigation.formData?.get('postId') : undefined;
  const confirmOn = (message: string) => (event: FormEvent) => {
    if (!window.confirm(message)) event.preventDefault();
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t('myPosts.title')}</h1>
          <p className="text-muted-foreground">{t('myPosts.lead')}</p>
        </div>
        <Link to={PATHS.newPost} className={buttonVariants()}>
          <Plus aria-hidden="true" />
          {t('myPosts.create')}
        </Link>
      </div>

      {!verified && <Alert variant="info">{t('myPosts.notVerified')}</Alert>}

      <nav
        aria-label={t('myPosts.tabsLabel')}
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map((tab) => {
          const active = tab === status;
          return (
            <Link
              key={tab ?? 'all'}
              to={tab ? `${PATHS.myPosts}?status=${tab}` : PATHS.myPosts}
              aria-current={active ? 'page' : undefined}
              className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-small font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-primary"
            >
              {tab ? t(`tutorPostStatus.${tab}`) : t('myPosts.all')}
            </Link>
          );
        })}
      </nav>

      {list.items.length === 0 ? (
        <Card className="items-start">
          <h2 className="text-h3">{t('myPosts.emptyTitle')}</h2>
          <p className="text-muted-foreground">{t('myPosts.emptyBody')}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((post) => {
            const busy = busyPost === post.id;
            const meta = [
              summarizeSubjects(post.subjects, catalogs.subjects, catalogs.grades),
              post.teachingMode && t(`teachingMode.${post.teachingMode}`),
            ]
              .filter(Boolean)
              .join(' · ');
            const dateLine =
              post.status === 'draft'
                ? t('myPosts.editedOn', { date: formatDate(post.updatedAt, i18n.language) })
                : post.publishedAt &&
                  t('myPosts.publishedOn', { date: formatDate(post.publishedAt, i18n.language) });
            return (
              <li key={post.id}>
                <Card className="gap-3 lg:flex-row lg:items-center lg:gap-6">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`${PATHS.myPosts}/${post.id}/edit`}
                        className="font-semibold text-foreground hover:text-primary"
                      >
                        {post.title}
                      </Link>
                      <Badge variant={STATUS_BADGE[post.status]} dot={post.status === 'open'}>
                        {t(`tutorPostStatus.${post.status}`)}
                      </Badge>
                      {post.moderationHidden && (
                        <Badge variant="danger">{t('myPosts.hiddenByModerator')}</Badge>
                      )}
                    </div>
                    {meta && <span className="text-small text-muted-foreground">{meta}</span>}
                    <span className="text-small text-muted-foreground">
                      {[
                        dateLine,
                        post.status !== 'draft' && t('myPosts.views', { count: post.viewCount }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
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
                        to={`${PATHS.myPosts}/${post.id}/edit`}
                        className={buttonVariants({ variant: 'ghost' })}
                      >
                        {t('myPosts.edit')}
                      </Link>
                    )}
                    {STATUS_ACTIONS[post.status].map((action) => (
                      <Form
                        key={action.to}
                        method="post"
                        onSubmit={
                          action.to === 'closed'
                            ? confirmOn(t('myPosts.confirmClose', { title: post.title }))
                            : undefined
                        }
                      >
                        <input type="hidden" name="intent" value="status" />
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="status" value={action.to} />
                        <Button
                          type="submit"
                          variant={
                            action.to === 'open' && post.status === 'draft' ? 'secondary' : 'ghost'
                          }
                          disabled={busy}
                        >
                          {t(action.label)}
                        </Button>
                      </Form>
                    ))}
                    {post.status === 'closed' && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="duplicate" />
                        <input type="hidden" name="postId" value={post.id} />
                        <Button type="submit" variant="ghost" disabled={busy}>
                          {t('myPosts.duplicate')}
                        </Button>
                      </Form>
                    )}
                    {(post.status === 'draft' || post.status === 'closed') && (
                      <Form
                        method="post"
                        onSubmit={confirmOn(t('myPosts.confirmDelete', { title: post.title }))}
                      >
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="postId" value={post.id} />
                        <Button type="submit" variant="ghost" disabled={busy}>
                          {t('myPosts.delete')}
                        </Button>
                      </Form>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount(list.total, PAGE_SIZE) > 1 && (
        <Pagination
          pathname={PATHS.myPosts}
          params={new URLSearchParams(status ? { status } : {})}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          maxPage={Number.MAX_SAFE_INTEGER}
        />
      )}

      <Alert variant="info">{t('myPosts.statusHelp')}</Alert>
    </PageContainer>
  );
}
