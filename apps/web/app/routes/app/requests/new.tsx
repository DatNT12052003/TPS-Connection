// /app/requests/new: phụ huynh đăng bài tìm gia sư (canvas NeedPost). `?learnerId=` chọn sẵn con (từ trang của con)
// và điền khối, khu vực của con. Chưa có hồ sơ con thì mời tạo trước (bài luôn gắn với một con, D25).
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { RequestPostForm } from '~/components/marketplace/request-post-form';
import { buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { requestPostValues } from '~/lib/posts-form';
import { loadRequestPostEditor, saveRequestPost } from '~/lib/request-posts.server';
import { requireUser } from '~/lib/session.server';
import type { Route } from './+types/new';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.requestEditor.newTitle} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  return loadRequestPostEditor(request, context);
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  return saveRequestPost(request, context);
}

export default function NewRequestPostPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const { preselected } = loaderData;
  const id = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

  return (
    <PageContainer>
      <div className="flex flex-col gap-1.5">
        <Breadcrumbs
          items={[
            { label: t('requestPosts.title'), to: PATHS.myRequests },
            { label: t('requestEditor.newShort') },
          ]}
        />
        <h1 className="text-h1">{t('requestEditor.newTitle')}</h1>
        <p className="text-muted-foreground">{t('requestEditor.lead')}</p>
      </div>
      {loaderData.learners.length === 0 ? (
        <Card className="max-w-2xl items-start">
          <h2 className="text-h3">{t('requestEditor.noChildTitle')}</h2>
          <p className="text-muted-foreground">{t('requestEditor.noChildBody')}</p>
          <Link to={PATHS.newChild} className={buttonVariants()}>
            {t('children.add')}
          </Link>
        </Card>
      ) : (
        <RequestPostForm
          values={
            failure?.values ??
            requestPostValues(null, i18n.language, {
              learnerId: preselected?.id ?? '',
              gradeLevelId: id(preselected?.gradeLevelId),
              provinceId: id(preselected?.provinceId),
              communeId: id(preselected?.communeId),
            })
          }
          errors={failure?.fieldErrors ?? {}}
          formError={failure?.formError}
          status={null}
          learners={loaderData.learners}
          subjects={loaderData.subjects}
          grades={loaderData.grades}
          provinces={loaderData.provinces}
          communes={failure?.communes ?? loaderData.communes}
        />
      )}
    </PageContainer>
  );
}
