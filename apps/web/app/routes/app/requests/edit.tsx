// /app/requests/:postId/edit: phụ huynh sửa bài tìm gia sư (canvas NeedPost). Con của bài không đổi được. Bài đã
// đóng không sửa được (về danh sách). Bài của phụ huynh khác: 404 như API.
import { useTranslation } from 'react-i18next';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { RequestPostForm } from '~/components/marketplace/request-post-form';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { requestPostValues } from '~/lib/posts-form';
import { loadRequestPostEditor, saveRequestPost } from '~/lib/request-posts.server';
import { requireUser } from '~/lib/session.server';
import { publishErrorFrom } from '~/lib/tutor-posts.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/edit';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.requestEditor.editTitle} – ${m.common.appName}` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const editor = await loadRequestPostEditor(request, context, params.postId);
  return { ...editor, publishError: publishErrorFrom(new URL(request.url)) };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  return saveRequestPost(request, context, params.postId);
}

export default function EditRequestPostPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const { post } = loaderData;
  if (!post) return null;
  return (
    <PageContainer>
      <div className="flex flex-col gap-1.5">
        <Breadcrumbs
          items={[
            { label: t('requestPosts.title'), to: PATHS.myRequests },
            { label: t('requestEditor.editTitle') },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{t('requestEditor.editTitle')}</h1>
          <Badge variant={post.status === 'open' ? 'success' : 'neutral'}>
            {t(`requestPostStatus.${post.status}`)}
          </Badge>
        </div>
      </div>
      {loaderData.publishError && !failure && (
        <Alert variant="warning" role="alert">
          {t('postEditor.savedNotPublished')} {tr(loaderData.publishError)}
        </Alert>
      )}
      <RequestPostForm
        values={failure?.values ?? requestPostValues(post, i18n.language)}
        errors={failure?.fieldErrors ?? {}}
        formError={failure?.formError}
        status={post.status}
        learners={loaderData.learners}
        subjects={loaderData.subjects}
        grades={loaderData.grades}
        provinces={loaderData.provinces}
        communes={failure?.communes ?? loaderData.communes}
      />
    </PageContainer>
  );
}
