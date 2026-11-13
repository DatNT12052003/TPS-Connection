// /app: trang tổng quan theo vai trò. Bản tối thiểu của G2 (ke_hoach_trien_khai.md, "Còn lại của G2"):
// phụ huynh thấy thẻ "Con của tôi" của canvas ParentHome; học sinh thấy hồ sơ của mình (canvas StudentHome
// chưa có lịch, điểm: G6, G7); gia sư làm ở đợt 3. Các khối khác của canvas thêm ở giai đoạn có dữ liệu.
import { type Learner, LearnerList } from '@tps/shared';
import { ChevronRight, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { invitePath, StudentAccountBadge } from '~/components/learners/student-account-status';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { type CatalogOption, labelOf } from '~/lib/catalog';
import { loadCommunes, loadGradeLevels, loadProvinces } from '~/lib/catalog.server';
import { formatDate } from '~/lib/format';
import { initialOf, learnerName } from '~/lib/learners';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { appRoleOf } from '~/lib/session';
import { requireUser } from '~/lib/session.server';
import type { Route } from './+types/home';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.appHome.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const role = appRoleOf(user);
  const greeting = { displayName: user.displayName };
  if (role !== 'parent' && role !== 'student') return { view: 'tutor' as const, ...greeting };

  const { locale } = await readPreferences(request);
  const [{ items }, gradeLevels] = await Promise.all([
    getServerApi(context).call('/api/v1/learners', { schema: LearnerList }),
    loadGradeLevels(context, locale),
  ]);

  if (role === 'parent') {
    const learners = items.filter((learner) => learner.viewer === 'guardian');
    const deleted = new URL(request.url).searchParams.get('deleted') === '1';
    return { view: 'parent' as const, ...greeting, learners, gradeLevels, deleted };
  }

  const own = items.find((learner) => learner.viewer === 'student') ?? null;
  const [provinces, communes] = await Promise.all([
    loadProvinces(context, locale),
    loadCommunes(context, locale, own?.provinceId ?? null),
  ]);
  return { view: 'student' as const, ...greeting, own, gradeLevels, provinces, communes };
}

export default function AppHomePage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  switch (loaderData.view) {
    case 'parent':
      return <ParentHome {...loaderData} />;
    case 'student':
      return <StudentHome {...loaderData} />;
    default:
      return (
        <PageContainer>
          <h1 className="text-h1">{t('appHome.title')}</h1>
          <Alert>{t('appHome.placeholder', { role: t('role.tutor') })}</Alert>
        </PageContainer>
      );
  }
}

function ParentHome({
  displayName,
  learners,
  gradeLevels,
  deleted,
}: {
  displayName: string;
  learners: Learner[];
  gradeLevels: CatalogOption[];
  deleted: boolean;
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
}: {
  displayName: string;
  own: Learner | null;
  gradeLevels: CatalogOption[];
  provinces: CatalogOption[];
  communes: CatalogOption[];
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
