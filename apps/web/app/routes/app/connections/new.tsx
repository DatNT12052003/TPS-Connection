// /app/connections/new?tutor=<slug|id>[&post=<slug|id>][&learnerId=]: phụ huynh gửi yêu cầu kết nối tới một gia sư
// (G5, §5.1), từ trang hồ sơ gia sư hoặc trang bài tuyển. Chọn hồ sơ con, môn (trong các môn gia sư dạy, hoặc của bài
// tuyển), khối, mục tiêu, hình thức, khu vực và lời nhắn. Gia sư chỉ thấy nhu cầu (môn, khối, mục tiêu, tỉnh/xã),
// không thấy tên con hay trường, địa chỉ (D16). Gửi xong: tới trang của yêu cầu.
import {
  ConnectionRequestDetail,
  CONNECTION_LIMITS,
  LearnerList,
  PublicTutorPost,
  PublicTutorProfile,
  RequestPostGoal,
  TeachingMode,
} from '@tps/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { LocationFields } from '~/components/forms/location-fields';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { Alert } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { SelectField, TextAreaField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { catalogIdFrom, labelOf } from '~/lib/catalog';
import { loadCatalogs, loadCommunes } from '~/lib/catalog.server';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from '~/lib/form';
import { learnerName } from '~/lib/learners';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/new';

const FIELDS = [
  'learnerId',
  'subjectId',
  'gradeLevelId',
  'goal',
  'goalNote',
  'teachingMode',
  'provinceId',
  'communeId',
  'message',
] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.sendRequest.title} – ${m.common.appName}` }];
}

const notFound = (error: unknown) => {
  if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
  throw error;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const url = new URL(request.url);
  const tutorRef = url.searchParams.get('tutor');
  const postRef = url.searchParams.get('post');
  if (!tutorRef) throw data(null, { status: 404 });
  const api = getServerApi(context);
  const { locale } = await readPreferences(request);
  const [tutor, post, learners, catalogs] = await Promise.all([
    api
      .call(`/api/v1/tutors/${encodeURIComponent(tutorRef)}`, { schema: PublicTutorProfile })
      .catch(notFound),
    postRef
      ? api
          .call(`/api/v1/tutor-posts/${encodeURIComponent(postRef)}`, { schema: PublicTutorPost })
          .catch(notFound)
      : Promise.resolve(null),
    api.call('/api/v1/learners', { schema: LearnerList }),
    loadCatalogs(context, locale),
  ]);
  if (post && post.tutor.id !== tutor.id) throw data(null, { status: 404 });

  const own = learners.items.filter((l) => l.viewer === 'guardian');
  const chosen = own.find((l) => l.id === url.searchParams.get('learnerId')) ?? own[0] ?? null;
  // Môn: của bài tuyển nếu gửi từ bài, không thì mọi môn gia sư dạy.
  const subjectIds = [
    ...new Set((post?.subjects ?? tutor.teachingSubjects).map((s) => s.subjectId)),
  ];
  const mode = post?.teachingMode ?? tutor.teachingMode ?? 'online';
  const defaults: Values = {
    learnerId: chosen?.id ?? '',
    subjectId: String(subjectIds[0] ?? ''),
    gradeLevelId: String(chosen?.gradeLevelId ?? ''),
    goal: 'reinforce',
    goalNote: '',
    teachingMode: mode === 'hybrid' ? 'in_person' : mode,
    provinceId: String(chosen?.provinceId ?? ''),
    communeId: String(chosen?.communeId ?? ''),
    message: '',
  };
  const communes = await loadCommunes(context, locale, chosen?.provinceId ?? null).catch(() => []);
  return {
    tutor,
    post,
    learners: own.map((l) => ({ id: l.id, name: learnerName(l) })),
    subjects: subjectIds.map((id) => ({ id, label: labelOf(catalogs.subjects, id) ?? '' })),
    catalogs,
    communes,
    defaults,
  };
}

interface Failure {
  values: Values;
  fieldErrors: Partial<Record<Field, Message>>;
  formError?: Message;
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const url = new URL(request.url);
  const form = await request.formData();
  const values = Object.fromEntries(FIELDS.map((f) => [f, formText(form, f)])) as Values;
  const api = getServerApi(context);
  try {
    const tutorId = formText(form, 'tutorId');
    const created = await api.call('/api/v1/connection-requests', {
      method: 'POST',
      body: {
        direction: 'client_to_tutor',
        tutorId,
        tutorPostId: formText(form, 'tutorPostId') || null,
        learnerId: values.learnerId,
        subjectId: catalogIdFrom(values.subjectId),
        gradeLevelId: catalogIdFrom(values.gradeLevelId),
        goal: values.goal,
        goalNote: values.goalNote,
        teachingMode: values.teachingMode,
        provinceId: catalogIdFrom(values.provinceId),
        communeId: values.teachingMode === 'online' ? null : catalogIdFrom(values.communeId),
        message: values.message,
      },
      schema: ConnectionRequestDetail,
    });
    throw redirect(`${PATHS.connections}/${created.id}?sent=1`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    // Gia sư không còn hiển thị, bài đã đóng: 404 chung cho trang.
    if (error.status === 404 && url.searchParams.get('tutor')) {
      return data<Failure>({
        values,
        fieldErrors: {},
        formError: { key: 'sendRequest.unavailable' },
      });
    }
    return data<Failure>({
      values,
      fieldErrors: fieldErrorsFrom(error, FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
    });
  }
}

export default function SendRequestPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const { tutor, post, learners, subjects, catalogs, communes, defaults } = loaderData;
  const values = actionData?.values ?? defaults;
  const errors = actionData?.fieldErrors ?? {};
  const err = (field: Field) => (errors[field] ? tr(errors[field]) : undefined);
  const [mode, setMode] = useState(values.teachingMode);
  const tutorPath = `/tutors/${tutor.slug}`;

  return (
    <PageContainer className="max-w-3xl">
      <Breadcrumbs
        items={[
          { label: t('nav.findTutors'), to: PATHS.findTutors },
          { label: tutor.displayName, to: tutorPath },
          { label: t('sendRequest.title') },
        ]}
      />
      <div className="flex items-center gap-4">
        <AvatarImage
          avatarUrl={tutor.avatarUrl}
          displayName={tutor.displayName}
          className="size-14 text-h3"
        />
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{t('sendRequest.title')}</h1>
          <p className="text-muted-foreground">
            {post
              ? t('sendRequest.leadPost', { name: tutor.displayName, post: post.title })
              : t('sendRequest.lead', { name: tutor.displayName })}
          </p>
        </div>
      </div>

      {!tutor.acceptingStudents && (
        <Alert variant="warning">{t('errors.tutor_not_accepting')}</Alert>
      )}

      {learners.length === 0 ? (
        <Card className="items-start">
          <h2 className="text-h3">{t('requestEditor.noChildTitle')}</h2>
          <p className="text-muted-foreground">{t('sendRequest.noChild')}</p>
          <Link to={PATHS.newChild} className={buttonVariants()}>
            {t('children.add')}
          </Link>
        </Card>
      ) : (
        <Card className="sm:p-6">
          <Form method="post" className="flex flex-col gap-4" noValidate>
            <input type="hidden" name="tutorId" value={tutor.id} />
            {post && <input type="hidden" name="tutorPostId" value={post.id} />}
            {actionData?.formError && <Alert variant="danger">{tr(actionData.formError)}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                name="learnerId"
                label={t('sendRequest.child')}
                defaultValue={values.learnerId}
                error={err('learnerId')}
              >
                {learners.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                name="subjectId"
                label={t('sendRequest.subject')}
                defaultValue={values.subjectId}
                error={err('subjectId')}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                name="gradeLevelId"
                label={t('sendRequest.grade')}
                defaultValue={values.gradeLevelId}
                error={err('gradeLevelId')}
              >
                <option value="">{t('location.choose')}</option>
                {catalogs.grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                name="goal"
                label={t('sendRequest.goal')}
                defaultValue={values.goal}
                error={err('goal')}
              >
                {RequestPostGoal.options.map((g) => (
                  <option key={g} value={g}>
                    {t(`requestPostGoal.${g}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextField
              name="goalNote"
              label={t('terms.goalNote')}
              defaultValue={values.goalNote}
              maxLength={CONNECTION_LIMITS.goalNoteLength}
              error={err('goalNote')}
            />
            <SelectField
              name="teachingMode"
              label={t('sendRequest.mode')}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              error={err('teachingMode')}
              className="sm:max-w-xs"
            >
              {TeachingMode.options.map((m) => (
                <option key={m} value={m}>
                  {t(`teachingMode.${m}`)}
                </option>
              ))}
            </SelectField>
            <div className="grid gap-4 sm:grid-cols-2">
              <LocationFields
                provinces={catalogs.provinces}
                communes={communes}
                provinceId={values.provinceId}
                communeId={values.communeId}
                provinceError={err('provinceId')}
                communeError={err('communeId')}
                hint={t('sendRequest.areaHint')}
              />
            </div>
            <TextAreaField
              name="message"
              label={t('sendRequest.message')}
              hint={t('sendRequest.messageHint')}
              defaultValue={values.message}
              maxLength={CONNECTION_LIMITS.messageLength}
              rows={5}
              error={err('message')}
              required
            />
            <Alert variant="info">{t('sendRequest.privacy')}</Alert>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={navigation.state !== 'idle'}>
                {t('sendRequest.submit')}
              </Button>
              <Link to={tutorPath} className={buttonVariants({ variant: 'ghost' })}>
                {t('sendRequest.back')}
              </Link>
            </div>
          </Form>
        </Card>
      )}
    </PageContainer>
  );
}
