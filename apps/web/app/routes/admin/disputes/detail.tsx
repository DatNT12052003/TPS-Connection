// /admin/disputes/:disputeId: Manager xem và quyết định một tranh chấp buổi học (G6, B.8; canvas Disputes). Bên trái:
// bản ghi của gia sư và khiếu nại của phụ huynh; bên phải: quyết định trạng thái buổi và điểm danh kèm lý do gửi hai
// bên. Manager chỉ sửa bản ghi, không hoàn tiền (D6); quyết định được ghi audit log.
import { AdminDispute, AttendanceStatus } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { KeyValue, KeyValueList } from '~/components/marketplace/key-value';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ChoiceCard, SelectField, TextAreaField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { labelOf } from '~/lib/catalog';
import { loadSubjects } from '~/lib/catalog.server';
import { lessonWhen, vnd } from '~/lib/classes';
import { type IntentResult, runIntent, textOf } from '~/lib/classes.server';
import { formatDateTime } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/detail';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.disputesAdmin.detailTitle} – ${m.common.appName}` }];
}

const disputePath = (id: string) => `/api/v1/admin/attendance-disputes/${encodeURIComponent(id)}`;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['manager'] });
  const { locale } = await readPreferences(request);
  const [dispute, subjects] = await Promise.all([
    getServerApi(context)
      .call(disputePath(params.disputeId), { schema: AdminDispute })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
        throw error;
      }),
    loadSubjects(context, locale),
  ]);
  return { dispute, subjects };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['manager'] });
  const form = await request.formData();
  if (textOf(form, 'intent') !== 'resolve') throw data(null, { status: 400 });
  const result: IntentResult = await runIntent(
    'resolve',
    form,
    ['lessonStatus', 'attendanceStatus', 'note'],
    () =>
      getServerApi(context).call(`${disputePath(params.disputeId)}/resolve`, {
        method: 'POST',
        body: {
          lessonStatus: textOf(form, 'lessonStatus'),
          attendanceStatus: textOf(form, 'attendanceStatus'),
          note: textOf(form, 'note'),
        },
      }),
  );
  return result.ok ? redirect(`${PATHS.adminDisputes}?done=1`) : data(result);
}

export default function DisputeDetailPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const { dispute: d, subjects } = loaderData;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const error = (field: string) => {
    const message = failure?.fieldErrors[field];
    return message ? tr(message) : undefined;
  };
  const title = `${labelOf(subjects, d.subjectId) ?? ''} · ${lessonWhen(t, d.lesson)}`;

  return (
    <PageContainer>
      <Breadcrumbs
        items={[{ label: t('nav.disputes'), to: PATHS.adminDisputes }, { label: title }]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1">{title}</h1>
        <Badge variant={d.status === 'escalated' ? 'danger' : 'neutral'}>
          {t(`attendanceDisputeStatus.${d.status}`)}
        </Badge>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-3 sm:p-6">
            <h2 className="text-h3">{t('disputesAdmin.tutorRecord', { name: d.tutorName })}</h2>
            <KeyValueList>
              <KeyValue label={t('disputesAdmin.lessonStatus')}>
                {t(`lessonStatus.${d.lesson.status}`)}
              </KeyValue>
              <KeyValue label={t('disputesAdmin.attendance')}>
                {t(`attendanceStatus.${d.attendance.status}`)}
              </KeyValue>
              {d.lesson.actualMinutes !== null && (
                <KeyValue label={t('lessons.actualMinutes')}>
                  {t('classes.minutes', { count: d.lesson.actualMinutes })}
                </KeyValue>
              )}
              <KeyValue label={t('disputesAdmin.price')}>
                {vnd(i18n.language, d.attendance.sessionPriceVnd)}
              </KeyValue>
              {d.lesson.contentTaught && (
                <KeyValue label={t('lessons.contentTaught')}>{d.lesson.contentTaught}</KeyValue>
              )}
              {d.attendance.comment && (
                <KeyValue label={t('lessons.comment')}>{d.attendance.comment}</KeyValue>
              )}
            </KeyValueList>
          </Card>
          <Card className="gap-3 sm:p-6">
            <h2 className="text-h3">{t('disputesAdmin.clientClaim', { name: d.clientName })}</h2>
            <KeyValueList>
              {d.claimedStatus && (
                <KeyValue label={t('lessons.claimedStatus')}>
                  {t(`attendanceStatus.${d.claimedStatus}`)}
                </KeyValue>
              )}
              <KeyValue label={t('lessons.disputeReason')}>{d.reason}</KeyValue>
              <KeyValue label={t('disputesAdmin.openedAt')}>
                {formatDateTime(d.createdAt, i18n.language)}
              </KeyValue>
            </KeyValueList>
          </Card>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          {d.status === 'escalated' ? (
            <Card className="sm:p-6">
              <Form method="post" className="flex flex-col gap-4">
                <input type="hidden" name="intent" value="resolve" />
                <h2 className="text-h3">{t('disputesAdmin.decision')}</h2>
                {failure?.formError && <Alert variant="danger">{tr(failure.formError)}</Alert>}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-label">{t('disputesAdmin.lessonStatus')}</legend>
                  <ChoiceCard
                    name="lessonStatus"
                    value="held"
                    defaultChecked={d.lesson.status !== 'tutor_absent'}
                    title={t('lessonStatus.held')}
                  />
                  <ChoiceCard
                    name="lessonStatus"
                    value="tutor_absent"
                    defaultChecked={d.lesson.status === 'tutor_absent'}
                    title={t('lessonStatus.tutor_absent')}
                  />
                </fieldset>
                <SelectField
                  name="attendanceStatus"
                  label={t('disputesAdmin.attendance')}
                  defaultValue={d.claimedStatus ?? d.attendance.status}
                  hint={t('disputesAdmin.attendanceHint')}
                  error={error('attendanceStatus')}
                >
                  {AttendanceStatus.options.map((s) => (
                    <option key={s} value={s}>
                      {t(`attendanceStatus.${s}`)}
                    </option>
                  ))}
                </SelectField>
                <TextAreaField
                  name="note"
                  label={t('disputesAdmin.note')}
                  hint={t('disputesAdmin.noteHint')}
                  rows={4}
                  maxLength={500}
                  required
                  error={error('note')}
                />
                <Alert variant="info">{t('disputesAdmin.rule')}</Alert>
                <Button type="submit" disabled={navigation.state !== 'idle'}>
                  {t('disputesAdmin.save')}
                </Button>
              </Form>
            </Card>
          ) : (
            <Card className="gap-2">
              <h2 className="text-h3">{t('disputesAdmin.decision')}</h2>
              {d.resolutionNote && <p className="whitespace-pre-line">{d.resolutionNote}</p>}
              {d.resolvedAt && (
                <span className="text-small text-muted-foreground">
                  {formatDateTime(d.resolvedAt, i18n.language)}
                </span>
              )}
            </Card>
          )}
          <Link to={PATHS.adminDisputes} className="font-semibold">
            {t('disputesAdmin.back')}
          </Link>
        </aside>
      </div>
    </PageContainer>
  );
}
