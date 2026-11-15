// /app/posts/new: gia sư tạo bài tuyển học sinh (canvas PostEditor). Gia sư chưa xác minh vẫn lưu nháp được (B.2);
// đăng cần đã duyệt danh tính (D5).
import { useTranslation } from 'react-i18next';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { TutorPostForm } from '~/components/marketplace/tutor-post-form';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { tutorPostValues } from '~/lib/posts-form';
import { requireUser } from '~/lib/session.server';
import { loadTutorPostEditor, saveTutorPost } from '~/lib/tutor-posts.server';
import type { Route } from './+types/new';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.postEditor.newTitle} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  return loadTutorPostEditor(request, context);
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  return saveTutorPost(request, context);
}

export default function NewTutorPostPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const failure = actionData && !actionData.ok ? actionData : undefined;
  return (
    <PageContainer>
      <div className="flex flex-col gap-1.5">
        <Breadcrumbs
          items={[
            { label: t('nav.posts'), to: PATHS.myPosts },
            { label: t('postEditor.newShort') },
          ]}
        />
        <h1 className="text-h1">{t('postEditor.newTitle')}</h1>
      </div>
      <TutorPostForm
        values={failure?.values ?? tutorPostValues(null, i18n.language)}
        errors={failure?.fieldErrors ?? {}}
        formError={failure?.formError}
        status={null}
        verified={loaderData.verified}
        subjects={loaderData.subjects}
        grades={loaderData.grades}
        provinces={loaderData.provinces}
        areas={failure?.areas ?? loaderData.areas}
      />
    </PageContainer>
  );
}
