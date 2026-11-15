// /app/posts/:postId/edit: gia sư sửa bài tuyển học sinh (canvas PostEditor). Bài đã đóng không sửa được (về danh
// sách; muốn đăng lại thì nhân bản, D33). Bài của gia sư khác: 404 như API.
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { TutorPostForm } from '~/components/marketplace/tutor-post-form';
import { Alert } from '~/components/ui/alert';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { tutorPostValues } from '~/lib/posts-form';
import { requireUser } from '~/lib/session.server';
import { loadTutorPostEditor, publishErrorFrom, saveTutorPost } from '~/lib/tutor-posts.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/edit';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.postEditor.editTitle} – ${m.common.appName}` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const editor = await loadTutorPostEditor(request, context, params.postId);
  const url = new URL(request.url);
  return {
    ...editor,
    publishError: publishErrorFrom(url),
    copied: url.searchParams.get('copied') === '1',
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  return saveTutorPost(request, context, params.postId);
}

export default function EditTutorPostPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const { post } = loaderData;
  if (!post) return null;
  return (
    <PageContainer>
      <div className="flex flex-col gap-1.5">
        <Breadcrumbs
          items={[{ label: t('nav.posts'), to: PATHS.myPosts }, { label: post.title }]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{t('postEditor.editTitle')}</h1>
          <Badge variant={post.status === 'open' ? 'success' : 'neutral'}>
            {t(`tutorPostStatus.${post.status}`)}
          </Badge>
        </div>
      </div>
      {loaderData.copied && <Alert variant="success">{t('postEditor.copied')}</Alert>}
      {loaderData.publishError && !failure && (
        <Alert variant="warning" role="alert">
          {t('postEditor.savedNotPublished')} {tr(loaderData.publishError)}
        </Alert>
      )}
      <TutorPostForm
        values={failure?.values ?? tutorPostValues(post, i18n.language)}
        errors={failure?.fieldErrors ?? {}}
        formError={failure?.formError}
        status={post.status}
        verified={loaderData.verified}
        subjects={loaderData.subjects}
        grades={loaderData.grades}
        provinces={loaderData.provinces}
        areas={failure?.areas ?? loaderData.areas}
      />
    </PageContainer>
  );
}
