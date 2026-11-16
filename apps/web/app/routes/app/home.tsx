// /app: trang tổng quan theo vai trò. G6: buổi cần điểm danh / cần xác nhận và lịch 7 ngày tới cho cả ba vai trò.
// Bản tối thiểu của G2 (ke_hoach_trien_khai.md, "Còn lại của G2"):
// phụ huynh thấy thẻ "Con của tôi" của canvas ParentHome; học sinh thấy hồ sơ của mình (canvas StudentHome
// chưa có lịch, điểm: G6, G7); gia sư thấy trạng thái hồ sơ, việc còn thiếu để xác minh và công tắc "Đang
// nhận học sinh" (canvas TutorHome; lớp, lịch dạy, yêu cầu kết nối: G4 đến G7).
import {
  ConnectionRequestList,
  ConversationList,
  FeeOverview,
  type Learner,
  LearnerList,
  LessonList,
  OwnTutorProfile,
} from '@tps/shared';
import { LessonCards, type LessonActivity } from '~/components/classes/lesson-cards';
import { FeeHomeCard } from '~/components/fees/fee-home-card';
import { currentMonth } from '~/lib/fees';
import { ActivityCards, type ConnectionsActivity } from '~/components/connections/activity-cards';
import { ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, useNavigation } from 'react-router';
import { invitePath, StudentAccountBadge } from '~/components/learners/student-account-status';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { type CatalogOption, labelOf } from '~/lib/catalog';
import { loadCommunes, loadGradeLevels, loadProvinces, loadSubjects } from '~/lib/catalog.server';
import { formatDate } from '~/lib/format';
import { initialOf, learnerName } from '~/lib/learners';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { appRoleOf } from '~/lib/session';
import { requireUser } from '~/lib/session.server';
import { profileBody } from '~/lib/tutor-profile';
import { ApiError } from '~/lib/api';
import { formErrorFrom, formText, type Message } from '~/lib/form';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/home';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.appHome.title} – ${m.common.appName}` }];
}

/**
 * Yêu cầu đang chờ người xem và cuộc trò chuyện có tin chưa đọc (G5). Chỉ là khối phụ của trang: API lỗi thì để trống.
 */
async function loadActivity(context: Route.LoaderArgs['context']): Promise<ConnectionsActivity> {
  const api = getServerApi(context);
  const [requests, conversations] = await Promise.all([
    api
      .call('/api/v1/connection-requests?state=open&pageSize=50', { schema: ConnectionRequestList })
      .then((list) => list.items.filter((r) => r.awaitingMe))
      .catch(() => []),
    api
      .call('/api/v1/conversations?pageSize=10', { schema: ConversationList })
      .then((list) => list.items.filter((c) => c.unreadCount > 0))
      .catch(() => []),
  ]);
  return { awaiting: requests, unread: conversations };
}

/** Buổi cần làm và buổi 7 ngày tới (G6). Khối phụ: API lỗi thì để trống. */
async function loadLessons(
  context: Route.LoaderArgs['context'],
  withTodo: boolean,
): Promise<LessonActivity> {
  const api = getServerApi(context);
  const now = Date.now();
  const range = new URLSearchParams({
    from: new Date(now).toISOString(),
    to: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const [todo, upcoming] = await Promise.all([
    withTodo
      ? api
          .call('/api/v1/lessons/todo', { schema: LessonList })
          .then((list) => list.items)
          .catch(() => [])
      : Promise.resolve([]),
    api
      .call(`/api/v1/lessons?${range.toString()}`, { schema: LessonList })
      .then((list) => list.items.filter((l) => l.status === 'scheduled'))
      .catch(() => []),
  ]);
  return { todo, upcoming };
}

/** Học phí tháng này (G7). Khối phụ: API lỗi thì không hiện. */
function loadFees(
  context: Route.LoaderArgs['context'],
  as: 'tutor' | 'client',
): Promise<FeeOverview | null> {
  return getServerApi(context)
    .call(`/api/v1/fees/overview?month=${currentMonth()}&as=${as}`, { schema: FeeOverview })
    .catch(() => null);
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const role = appRoleOf(user);
  const greeting = { displayName: user.displayName };
  const { locale } = await readPreferences(request);
  if (role === 'tutor') {
    const [profile, activity, subjects, grades, lessons, fees] = await Promise.all([
      getServerApi(context).call('/api/v1/me/tutor-profile', { schema: OwnTutorProfile }),
      loadActivity(context),
      loadSubjects(context, locale),
      loadGradeLevels(context, locale),
      loadLessons(context, true),
      loadFees(context, 'tutor'),
    ]);
    return {
      view: 'tutor' as const,
      ...greeting,
      profile,
      activity,
      subjects,
      grades,
      lessons,
      fees,
    };
  }
  if (role !== 'parent' && role !== 'student') throw data(null, { status: 404 });

  const [{ items }, gradeLevels] = await Promise.all([
    getServerApi(context).call('/api/v1/learners', { schema: LearnerList }),
    loadGradeLevels(context, locale),
  ]);

  if (role === 'parent') {
    const learners = items.filter((learner) => learner.viewer === 'guardian');
    const deleted = new URL(request.url).searchParams.get('deleted') === '1';
    const [activity, subjects, lessons, fees] = await Promise.all([
      loadActivity(context),
      loadSubjects(context, locale),
      loadLessons(context, true),
      loadFees(context, 'client'),
    ]);
    return {
      view: 'parent' as const,
      ...greeting,
      learners,
      gradeLevels,
      deleted,
      activity,
      subjects,
      lessons,
      fees,
    };
  }

  const own = items.find((learner) => learner.viewer === 'student') ?? null;
  const [provinces, communes, subjects, lessons] = await Promise.all([
    loadProvinces(context, locale),
    loadCommunes(context, locale, own?.provinceId ?? null),
    loadSubjects(context, locale),
    loadLessons(context, false),
  ]);
  return {
    view: 'student' as const,
    ...greeting,
    own,
    gradeLevels,
    provinces,
    communes,
    subjects,
    lessons,
  };
}

/** Gia sư bật/tắt "Đang nhận học sinh" (API chỉ có PUT cả hồ sơ: đọc hồ sơ rồi gửi lại với giá trị mới). */
export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor'] });
  const form = await request.formData();
  if (formText(form, 'intent') !== 'accepting') throw data(null, { status: 400 });
  const api = getServerApi(context);
  try {
    const profile = await api.call('/api/v1/me/tutor-profile', { schema: OwnTutorProfile });
    await api.call('/api/v1/me/tutor-profile', {
      method: 'PUT',
      body: { ...profileBody(profile), acceptingStudents: formText(form, 'accepting') === 'true' },
      schema: OwnTutorProfile,
    });
    return { ok: true as const };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return { ok: false as const, formError: formErrorFrom(error) };
  }
}

export default function AppHomePage({ loaderData, actionData }: Route.ComponentProps) {
  switch (loaderData.view) {
    case 'parent':
      return <ParentHome {...loaderData} />;
    case 'student':
      return <StudentHome {...loaderData} />;
    default:
      return (
        <TutorHome
          {...loaderData}
          formError={actionData && !actionData.ok ? actionData.formError : undefined}
        />
      );
  }
}

function TutorHome({
  displayName,
  profile,
  formError,
  activity,
  subjects,
  grades,
  lessons,
  fees,
}: {
  displayName: string;
  profile: OwnTutorProfile;
  formError: Message | undefined;
  activity: ConnectionsActivity;
  subjects: CatalogOption[];
  grades: CatalogOption[];
  lessons: LessonActivity;
  fees: FeeOverview | null;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const switching = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const status = profile.profileStatus;
  const missing = profile.missingForVerification;

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-h1">{t('appHome.hello', { name: displayName })}</h1>
          <span className="flex flex-wrap items-center gap-2">
            {status === 'verified' ? (
              <Badge variant="verified">
                <ShieldCheck aria-hidden="true" className="size-3.5" />
                {t('tutorProfile.identityVerified')}
              </Badge>
            ) : (
              <Badge variant={status === 'incomplete' ? 'warning' : 'neutral'}>
                {t(`tutorProfileStatus.${status}`)}
              </Badge>
            )}
            <span className="text-small text-muted-foreground">
              {t(status === 'verified' ? 'tutorHome.public' : 'tutorHome.notPublic')}
            </span>
          </span>
        </div>
        <Form method="post" className="flex flex-col items-start gap-1 sm:items-end">
          <input type="hidden" name="intent" value="accepting" />
          <input type="hidden" name="accepting" value={String(!profile.acceptingStudents)} />
          <span className="text-small font-semibold">
            {t(profile.acceptingStudents ? 'tutorHome.accepting' : 'tutorHome.notAccepting')}
          </span>
          <Button type="submit" variant="secondary" disabled={switching} aria-busy={switching}>
            {t(profile.acceptingStudents ? 'tutorHome.stopAccepting' : 'tutorHome.startAccepting')}
          </Button>
        </Form>
      </div>
      {formError && (
        <Alert variant="danger" role="alert">
          {tr(formError)}
        </Alert>
      )}

      {status !== 'verified' && (
        <Card className="gap-3 border-primary ring-1 ring-primary sm:p-6">
          <h2 className="text-h3">
            {missing.length > 0 ? t('tutorHome.finishTitle') : t('tutorHome.verifyTitle')}
          </h2>
          <p className="text-small text-muted-foreground">
            {missing.length > 0
              ? t('tutorHome.finishBody', { count: missing.length })
              : status === 'pending_verification'
                ? t('tutorProfile.identityPending')
                : t('tutorHome.verifyBody')}
          </p>
          <Link
            to={missing.length > 0 ? PATHS.tutorProfileEdit : PATHS.tutorProfile}
            className={buttonVariants({ className: 'self-start' })}
          >
            {missing.length > 0 ? t('tutorProfile.completeProfile') : t('tutorHome.openProfile')}
          </Link>
        </Card>
      )}

      <LessonCards activity={lessons} role="tutor" subjects={subjects} />

      <FeeHomeCard overview={fees} role="tutor" />

      <ActivityCards activity={activity} subjects={subjects} grades={grades} />

      <Card className="gap-3 sm:p-6">
        <CardHeader>
          <h2 className="text-h3">{t('tutorHome.profileTitle')}</h2>
          <Link to={PATHS.tutorProfile} className={buttonVariants({ variant: 'ghost' })}>
            {t('tutorHome.openProfile')}
            <ChevronRight aria-hidden="true" />
          </Link>
        </CardHeader>
        <p className="text-small text-muted-foreground">{t('tutorHome.comingSoon')}</p>
      </Card>
    </PageContainer>
  );
}

function ParentHome({
  displayName,
  learners,
  gradeLevels,
  deleted,
  activity,
  subjects,
  lessons,
  fees,
}: {
  displayName: string;
  learners: Learner[];
  gradeLevels: CatalogOption[];
  deleted: boolean;
  activity: ConnectionsActivity;
  subjects: CatalogOption[];
  lessons: LessonActivity;
  fees: FeeOverview | null;
}) {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <h1 className="text-h1">{t('appHome.hello', { name: displayName })}</h1>
      {deleted && (
        <Alert variant="success" role="status">
          {t('learnerForm.deleted')}
        </Alert>
      )}

      <LessonCards activity={lessons} role="parent" subjects={subjects} />

      <FeeHomeCard overview={fees} role="client" />

      <ActivityCards activity={activity} subjects={subjects} grades={gradeLevels} />

      <Card className="max-w-3xl">
        <CardHeader>
          <h2 className="text-h3">{t('children.title')}</h2>
          {learners.length > 0 && (
            <Link to={PATHS.newChild} className={buttonVariants({ variant: 'ghost' })}>
              <Plus aria-hidden="true" />
              {t('children.add')}
            </Link>
          )}
        </CardHeader>

        {learners.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-muted-foreground">{t('children.empty')}</p>
            <Link to={PATHS.newChild} className={buttonVariants()}>
              <Plus aria-hidden="true" />
              {t('children.addFirst')}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {learners.map((learner) => (
              <ChildRow key={learner.id} learner={learner} gradeLevels={gradeLevels} />
            ))}
          </ul>
        )}
      </Card>

      {/* Tìm gia sư (G4): tìm theo hồ sơ, hoặc đăng bài để gia sư chủ động ứng tuyển. */}
      <Card className="max-w-3xl">
        <CardHeader>
          <h2 className="text-h3">{t('requestPosts.homeTitle')}</h2>
          <Link to={PATHS.myRequests} className={buttonVariants({ variant: 'ghost' })}>
            {t('requestPosts.homeMine')}
          </Link>
        </CardHeader>
        <p className="text-muted-foreground">{t('requestPosts.homeBody')}</p>
        <div className="flex flex-wrap gap-2">
          <Link to={PATHS.findTutors} className={buttonVariants({ variant: 'secondary' })}>
            {t('nav.findTutors')}
          </Link>
          {learners.length > 0 && (
            <Link to={PATHS.newRequest} className={buttonVariants({ variant: 'secondary' })}>
              <Plus aria-hidden="true" />
              {t('requestPosts.create')}
            </Link>
          )}
        </div>
      </Card>
    </PageContainer>
  );
}

function ChildRow({ learner, gradeLevels }: { learner: Learner; gradeLevels: CatalogOption[] }) {
  const { t } = useTranslation();
  const name = learnerName(learner);
  const grade = labelOf(gradeLevels, learner.gradeLevelId);
  const detailPath = `${PATHS.children}/${learner.id}`;
  return (
    <li className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
      <span
        aria-hidden="true"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-bold text-primary-subtle-foreground"
      >
        {initialOf(name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="font-semibold">{grade ? `${name} · ${grade}` : name}</span>
        {learner.hasStudentAccount || learner.pendingInvitation ? (
          <StudentAccountBadge learner={learner} />
        ) : (
          <Link
            to={invitePath(learner.id)}
            className="text-small font-semibold text-primary hover:text-primary-hover"
          >
            {t('invite.cta')}
          </Link>
        )}
      </div>
      <Link
        to={detailPath}
        aria-label={t('children.viewNamed', { name })}
        className={buttonVariants({ variant: 'ghost', className: 'max-sm:px-2' })}
      >
        <span className="max-sm:sr-only">{t('children.view')}</span>
        <ChevronRight aria-hidden="true" className="sm:hidden" />
      </Link>
    </li>
  );
}

function StudentHome({
  displayName,
  own,
  gradeLevels,
  provinces,
  communes,
  subjects,
  lessons,
}: {
  displayName: string;
  own: Learner | null;
  gradeLevels: CatalogOption[];
  provinces: CatalogOption[];
  communes: CatalogOption[];
  subjects: CatalogOption[];
  lessons: LessonActivity;
}) {
  const { t, i18n } = useTranslation();
  const area = [labelOf(provinces, own?.provinceId), labelOf(communes, own?.communeId)]
    .filter(Boolean)
    .join(' · ');
  const rows: [string, string | undefined | null][] = own
    ? [
        [t('learnerForm.fullName'), own.fullName],
        [t('learnerForm.nickname'), own.nickname],
        [t('learnerForm.gradeLevel'), labelOf(gradeLevels, own.gradeLevelId)],
        [
          t('learnerForm.dateOfBirth'),
          own.dateOfBirth && formatDate(own.dateOfBirth, i18n.language),
        ],
        [t('learnerForm.school'), own.schoolName],
        [t('studentHome.area'), area],
      ]
    : [];

  return (
    <PageContainer>
      <h1 className="text-h1">{t('appHome.hello', { name: displayName })}</h1>
      <LessonCards activity={lessons} role="student" subjects={subjects} />
      <Card className="max-w-2xl">
        <h2 className="text-h3">{t('studentHome.profileTitle')}</h2>
        {own ? (
          <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words">{value || '–'}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground">{t('studentHome.noProfile')}</p>
        )}
      </Card>
      <p className="text-small text-muted-foreground">{t('studentHome.askParent')}</p>
    </PageContainer>
  );
}
