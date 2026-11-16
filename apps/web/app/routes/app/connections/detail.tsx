// /app/connections/:requestId: một yêu cầu kết nối (G5, §5, B.1). Người xem là một bên (gia sư hoặc phụ huynh); bên
// khác: 404 từ API. Theo trạng thái:
//   - chờ phản hồi: bên nhận chấp nhận (mở trò chuyện, D14) hoặc từ chối kèm lời nhắn; bên gửi rút yêu cầu;
//   - đang trao đổi: đề xuất điều kiện hợp tác (phiên bản mới, C6, D18), xác nhận phiên bản mới nhất, hủy (D32);
//   - đã xác nhận hợp tác: liên hệ của bên kia và (với gia sư) danh tính của trẻ (D16).
// Intent: accept | reject | cancel | terms | confirm | block | report. Bên kia sửa điều khoản trong lúc mình xác nhận:
// API trả 409 terms_outdated, trang hiện lỗi và phiên bản mới.
import {
  type ConnectionContact,
  type ConnectionLearnerIdentity,
  ConnectionRequestDetail,
  type ConnectionTerms,
} from '@tps/shared';
import { MessageSquare } from 'lucide-react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, useNavigation } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { type SafetyResult, SafetyActions } from '~/components/connections/safety-actions';
import {
  TERMS_FIELDS,
  type TermsField,
  TermsForm,
  type TermsValues,
} from '~/components/connections/terms-form';
import { PageContainer } from '~/components/layout/page';
import { Breadcrumbs } from '~/components/marketplace/breadcrumbs';
import { KeyValue, KeyValueList } from '~/components/marketplace/key-value';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardHeader } from '~/components/ui/card';
import { TextAreaField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { type AreaRef, catalogIdFrom, type CatalogOption, labelOf } from '~/lib/catalog';
import { loadAreaRefs, loadCatalogs, loadCommunes } from '~/lib/catalog.server';
import {
  CONNECTION_STATUS_BADGE,
  counterpartName,
  needSummary,
  nextStepKey,
  scheduleLabel,
} from '~/lib/connections';
import { displayToIso, isoToDisplay } from '~/lib/dates';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from '~/lib/form';
import { formatDate, formatDateTime } from '~/lib/format';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { handleSafetyIntent } from '~/lib/safety.server';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/detail';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.connections.detailTitle} – ${m.common.appName}` }];
}

const detailPath = (id: string) => `/api/v1/connection-requests/${encodeURIComponent(id)}`;

/** Giá trị ban đầu của form điều khoản: phiên bản mới nhất, không có thì từ nhu cầu. */
function termsValues(detail: ConnectionRequestDetail): TermsValues {
  const terms = detail.terms;
  const need = detail.need;
  return {
    gradeLevelId: String(terms?.gradeLevelId ?? need.gradeLevelId),
    goal: terms?.goal ?? need.goal,
    goalNote: terms?.goalNote ?? need.goalNote ?? '',
    teachingMode: terms?.teachingMode ?? need.teachingMode,
    provinceId: String(terms?.provinceId ?? need.provinceId ?? ''),
    communeId: String(terms?.communeId ?? need.communeId ?? ''),
    sessionPriceVnd: terms ? String(terms.sessionPriceVnd) : '',
    sessionMinutes: String(terms?.sessionMinutes ?? 90),
    sessionsPerWeek: terms?.sessionsPerWeek ? String(terms.sessionsPerWeek) : '',
    schedule: JSON.stringify(terms?.schedule ?? []),
    startDate: terms?.startDate ? isoToDisplay(terms.startDate) : '',
    note: terms?.note ?? '',
  };
}

function termsBody(values: TermsValues): unknown {
  const integer = (text: string) => {
    const digits = text.replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  };
  let schedule: unknown = [];
  try {
    schedule = JSON.parse(values.schedule || '[]');
  } catch {
    schedule = null;
  }
  const startDate = values.startDate.trim();
  return {
    gradeLevelId: catalogIdFrom(values.gradeLevelId),
    goal: values.goal,
    goalNote: values.goalNote,
    teachingMode: values.teachingMode,
    provinceId: values.teachingMode === 'online' ? null : catalogIdFrom(values.provinceId),
    communeId: values.teachingMode === 'online' ? null : catalogIdFrom(values.communeId),
    sessionPriceVnd: integer(values.sessionPriceVnd),
    sessionMinutes: integer(values.sessionMinutes),
    sessionsPerWeek: integer(values.sessionsPerWeek),
    schedule,
    // Ngày gõ sai định dạng: gửi nguyên chữ để API trả lỗi đúng ô.
    startDate: startDate ? (displayToIso(startDate) ?? startDate) : null,
    note: values.note,
  };
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const api = getServerApi(context);
  const detail = await api
    .call(detailPath(params.requestId), { schema: ConnectionRequestDetail })
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
      throw error;
    });
  const { locale } = await readPreferences(request);
  const provinceId = detail.terms?.provinceId ?? detail.need.provinceId;
  const communeIds = [detail.need.communeId, detail.terms?.communeId].filter(
    (id): id is number => typeof id === 'number',
  );
  const [catalogs, communes, communeRefs] = await Promise.all([
    loadCatalogs(context, locale),
    loadCommunes(context, locale, provinceId).catch(() => []),
    loadAreaRefs(context, locale, communeIds).catch(() => []),
  ]);
  return { detail, catalogs, communes, communeRefs };
}

type ActionResult =
  | {
      intent: 'terms';
      ok: false;
      values: TermsValues;
      fieldErrors: Partial<Record<TermsField, Message>>;
      formError?: Message;
    }
  | { intent: 'accept' | 'reject' | 'cancel' | 'confirm' | 'terms'; ok: false; formError: Message }
  | { intent: 'accept' | 'reject' | 'cancel' | 'confirm' | 'terms'; ok: true }
  | SafetyResult;

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['tutor', 'parent'] });
  const form = await request.formData();
  const api = getServerApi(context);
  const safety = await handleSafetyIntent(api, form);
  if (safety) return data<ActionResult>(safety);

  const intent = formText(form, 'intent');
  const path = detailPath(params.requestId);
  const send = async (suffix: string, body?: unknown) =>
    api.call(`${path}/${suffix}`, { method: 'POST', body, schema: ConnectionRequestDetail });

  try {
    switch (intent) {
      case 'accept':
      case 'cancel':
        await send(intent);
        return data<ActionResult>({ intent, ok: true });
      case 'reject':
        await send('reject', { note: formText(form, 'note') });
        return data<ActionResult>({ intent, ok: true });
      case 'confirm':
        await send('confirm', { version: Number(formText(form, 'version')) });
        return data<ActionResult>({ intent, ok: true });
      case 'terms': {
        const values = Object.fromEntries(
          TERMS_FIELDS.map((f) => [f, formText(form, f)]),
        ) as TermsValues;
        try {
          await send('terms', termsBody(values));
          return data<ActionResult>({ intent, ok: true });
        } catch (error) {
          if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) {
            throw error;
          }
          return data<ActionResult>({
            intent,
            ok: false,
            values,
            fieldErrors: fieldErrorsFrom(error, TERMS_FIELDS),
            ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
          });
        }
      }
      default:
        throw data(null, { status: 400 });
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    if (intent !== 'accept' && intent !== 'reject' && intent !== 'cancel' && intent !== 'confirm') {
      throw error;
    }
    return data<ActionResult>({ intent, ok: false, formError: formErrorFrom(error) });
  }
}

function areaText(
  provinceId: number | null,
  communeId: number | null,
  provinces: readonly CatalogOption[],
  communes: readonly AreaRef[],
): string | null {
  const province = labelOf(provinces, provinceId);
  const commune = communes.find((c) => c.id === communeId)?.label;
  return [commune, province].filter(Boolean).join(', ') || null;
}

function ContactList({ contact }: { contact: ConnectionContact }) {
  const { t } = useTranslation();
  return (
    <KeyValueList>
      {contact.fullName && (
        <KeyValue label={t('connections.fullName')}>{contact.fullName}</KeyValue>
      )}
      {contact.email && (
        <KeyValue label={t('connections.email')}>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
        </KeyValue>
      )}
      {contact.phone && (
        <KeyValue label={t('connections.phone')}>
          <a href={`tel:${contact.phone}`}>{contact.phone}</a>
        </KeyValue>
      )}
    </KeyValueList>
  );
}

function LearnerIdentity({ identity }: { identity: ConnectionLearnerIdentity }) {
  const { t } = useTranslation();
  return (
    <KeyValueList>
      {identity.fullName && (
        <KeyValue label={t('connections.childName')}>
          {identity.fullName}
          {identity.nickname && ` (${identity.nickname})`}
        </KeyValue>
      )}
      {identity.schoolName && (
        <KeyValue label={t('connections.school')}>{identity.schoolName}</KeyValue>
      )}
      {identity.addressLine && (
        <KeyValue label={t('connections.address')}>{identity.addressLine}</KeyValue>
      )}
    </KeyValueList>
  );
}

function TermsSummary({
  terms,
  myRole,
  grades,
  areas,
}: {
  terms: ConnectionTerms;
  myRole: 'tutor' | 'client';
  grades: readonly CatalogOption[];
  areas: string | null;
}) {
  const { t, i18n } = useTranslation();
  const money = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'VND' });
  const confirmed = (at: string | null) =>
    at
      ? t('terms.confirmedAt', { date: formatDateTime(at, i18n.language) })
      : t('terms.notConfirmed');
  return (
    <KeyValueList>
      <KeyValue label={t('terms.sessionPrice')}>
        {t('terms.priceLine', {
          price: money.format(terms.sessionPriceVnd),
          minutes: terms.sessionMinutes,
        })}
      </KeyValue>
      {terms.sessionsPerWeek && (
        <KeyValue label={t('terms.sessionsPerWeek')}>{terms.sessionsPerWeek}</KeyValue>
      )}
      {terms.schedule.length > 0 && (
        <KeyValue label={t('terms.schedule')}>{scheduleLabel(t, terms.schedule)}</KeyValue>
      )}
      {terms.startDate && (
        <KeyValue label={t('terms.startDate')}>
          {formatDate(terms.startDate, i18n.language)}
        </KeyValue>
      )}
      <KeyValue label={t('terms.learning')}>
        {[
          labelOf(grades, terms.gradeLevelId),
          t(`requestPostGoal.${terms.goal}`),
          terms.goalNote,
          t(`teachingMode.${terms.teachingMode}`),
          terms.teachingMode !== 'online' && areas,
        ]
          .filter(Boolean)
          .join(' · ')}
      </KeyValue>
      {terms.note && (
        <KeyValue label={t('terms.note')}>
          <span className="whitespace-pre-line">{terms.note}</span>
        </KeyValue>
      )}
      <KeyValue label={t('terms.proposedBy')}>
        {terms.proposedBy === myRole
          ? t('connections.you')
          : t(`connections.party_${terms.proposedBy}`)}
      </KeyValue>
      <KeyValue label={t('connections.party_tutor')}>{confirmed(terms.tutorConfirmedAt)}</KeyValue>
      <KeyValue label={t('connections.party_client')}>
        {confirmed(terms.clientConfirmedAt)}
      </KeyValue>
    </KeyValueList>
  );
}

export default function ConnectionDetailPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const { detail, catalogs, communes, communeRefs } = loaderData;
  const busy = navigation.state !== 'idle';
  const name = counterpartName(t, detail);
  const step = nextStepKey(detail, detail.terms);
  // Lỗi của chặn / báo cáo hiện trong thẻ của chúng; lỗi điều khoản hiện trong form.
  const failure =
    actionData &&
    !actionData.ok &&
    actionData.intent !== 'terms' &&
    actionData.intent !== 'block' &&
    actionData.intent !== 'report'
      ? actionData
      : undefined;
  const termsFailure =
    actionData?.intent === 'terms' && !actionData.ok && 'values' in actionData
      ? actionData
      : undefined;
  const termsSaved = actionData?.intent === 'terms' && actionData.ok;
  const safetyResult =
    actionData && (actionData.intent === 'block' || actionData.intent === 'report')
      ? actionData
      : undefined;
  const myConfirmation =
    detail.terms &&
    (detail.myRole === 'tutor' ? detail.terms.tutorConfirmedAt : detail.terms.clientConfirmedAt);
  const confirmOn = (message: string) => (event: FormEvent) => {
    if (!window.confirm(message)) event.preventDefault();
  };
  const needArea = areaText(
    detail.need.provinceId,
    detail.need.communeId,
    catalogs.provinces,
    communeRefs,
  );
  const termsArea = detail.terms
    ? areaText(detail.terms.provinceId, detail.terms.communeId, catalogs.provinces, communeRefs)
    : null;
  const subject = labelOf(catalogs.subjects, detail.need.subjectId) ?? '';

  // Chặn / báo cáo: phụ huynh biết id gia sư; gia sư chặn phụ huynh qua cuộc trò chuyện (có sau khi chấp nhận).
  const blockTarget =
    detail.myRole === 'client'
      ? { tutorId: detail.tutor.id }
      : detail.conversationId
        ? { conversationId: detail.conversationId }
        : null;
  const reportTarget: Record<string, string> | null =
    detail.myRole === 'client'
      ? { targetType: 'tutor', tutorId: detail.tutor.id }
      : detail.conversationId
        ? { targetType: 'conversation_user', conversationId: detail.conversationId }
        : null;

  return (
    <PageContainer>
      <Breadcrumbs
        items={[{ label: t('connections.title'), to: PATHS.connections }, { label: name }]}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-4">
              <AvatarImage
                avatarUrl={detail.myRole === 'client' ? detail.tutor.avatarUrl : null}
                displayName={name}
                className="size-14 text-h3"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h1 className="text-h2">{t('connections.withName', { name, subject })}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={CONNECTION_STATUS_BADGE[detail.status]}>
                    {t(`connectionRequestStatus.${detail.status}`)}
                  </Badge>
                  <span className="text-small text-muted-foreground">
                    {t(`connectionDirection.${detail.direction}`)}
                  </span>
                </div>
              </div>
              {detail.myRole === 'client' && (
                <Link
                  to={`/tutors/${detail.tutor.slug}`}
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  {t('connections.viewTutorProfile')}
                </Link>
              )}
            </div>
            {step && <Alert variant="info">{t(step, { name })}</Alert>}
            {detail.status === 'cancelled' && detail.cancelReason && (
              <Alert variant="warning">{t(`connectionCancelReason.${detail.cancelReason}`)}</Alert>
            )}
            {detail.expiresAt && (
              <p className="text-small text-muted-foreground">
                {t('connections.expiresAt', {
                  date: formatDateTime(detail.expiresAt, i18n.language),
                })}
              </p>
            )}
            {failure && <Alert variant="danger">{tr(failure.formError)}</Alert>}
          </Card>

          <Card className="gap-4 sm:p-6">
            <h2 className="text-h3">{t('connections.needTitle')}</h2>
            <KeyValueList>
              <KeyValue label={t('connections.need')}>
                {needSummary(t, detail.need, catalogs)}
              </KeyValue>
              {detail.need.goalNote && (
                <KeyValue label={t('terms.goalNote')}>{detail.need.goalNote}</KeyValue>
              )}
              {needArea && <KeyValue label={t('connections.area')}>{needArea}</KeyValue>}
              {detail.learner && (
                <KeyValue label={t('connections.child')}>{detail.learner.name}</KeyValue>
              )}
              <KeyValue label={t('connections.message')}>
                <span className="whitespace-pre-line">{detail.message}</span>
              </KeyValue>
              {detail.rejectionNote && (
                <KeyValue label={t('connections.rejectionNote')}>
                  <span className="whitespace-pre-line">{detail.rejectionNote}</span>
                </KeyValue>
              )}
            </KeyValueList>
            {detail.myRole === 'tutor' && detail.status !== 'confirmed' && (
              <p className="text-small text-muted-foreground">
                {t('connections.childPrivacyTutor')}
              </p>
            )}
          </Card>

          {(detail.terms || detail.status === 'negotiating') && (
            <Card className="gap-4 sm:p-6">
              <CardHeader>
                <h2 className="text-h3">
                  {detail.status === 'confirmed'
                    ? t('terms.agreedTitle')
                    : detail.terms
                      ? t('terms.latestTitle', { version: detail.terms.version })
                      : t('terms.title')}
                </h2>
              </CardHeader>
              {termsSaved && <Alert variant="success">{t('terms.proposed')}</Alert>}
              {detail.terms ? (
                <TermsSummary
                  terms={detail.terms}
                  myRole={detail.myRole}
                  grades={catalogs.grades}
                  areas={termsArea}
                />
              ) : (
                <p className="text-muted-foreground">{t('terms.none')}</p>
              )}
              {detail.status === 'negotiating' && detail.terms && !myConfirmation && (
                <Form method="post" onSubmit={confirmOn(t('terms.confirmPrompt'))}>
                  <input type="hidden" name="intent" value="confirm" />
                  <input type="hidden" name="version" value={detail.terms.version} />
                  <Button type="submit" disabled={busy}>
                    {t('terms.confirm', { version: detail.terms.version })}
                  </Button>
                </Form>
              )}
              {detail.status === 'negotiating' && (
                <details className="group" open={Boolean(termsFailure) || !detail.terms}>
                  <summary className="cursor-pointer font-semibold text-primary">
                    {detail.terms ? t('terms.proposeNew') : t('terms.proposeFirst')}
                  </summary>
                  <div className="mt-4">
                    <TermsForm
                      values={termsFailure?.values ?? termsValues(detail)}
                      fieldErrors={termsFailure?.fieldErrors}
                      formError={termsFailure?.formError}
                      grades={catalogs.grades}
                      provinces={catalogs.provinces}
                      communes={communes}
                      submitting={busy && navigation.formData?.get('intent') === 'terms'}
                    />
                  </div>
                </details>
              )}
            </Card>
          )}

          {detail.contact && (
            <Card className="gap-4 sm:p-6">
              <h2 className="text-h3">{t('connections.contactTitle', { name })}</h2>
              <ContactList contact={detail.contact} />
              {detail.learnerIdentity && (
                <>
                  <h3 className="text-body-strong">{t('connections.childIdentity')}</h3>
                  <LearnerIdentity identity={detail.learnerIdentity} />
                </>
              )}
              <p className="text-small text-muted-foreground">{t('connections.classNext')}</p>
            </Card>
          )}

          <Card className="gap-3 sm:p-6">
            <h2 className="text-h3">{t('connections.history')}</h2>
            <ol className="flex flex-col gap-2">
              {detail.events.map((e, index) => (
                <li key={`${e.event}-${index}`} className="flex flex-wrap gap-x-3 text-small">
                  <span className="text-muted-foreground">
                    {formatDateTime(e.createdAt, i18n.language)}
                  </span>
                  <span>
                    {t(`connectionEventType.${e.event}`)}
                    {' · '}
                    {e.actor === detail.myRole
                      ? t('connections.you')
                      : t(`connections.party_${e.actor}`)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          {detail.status === 'pending' && !detail.isSender && (
            <Card className="gap-3">
              <h2 className="text-h3">{t('connections.replyTitle')}</h2>
              <Form method="post">
                <input type="hidden" name="intent" value="accept" />
                <Button type="submit" block disabled={busy}>
                  {t('connections.accept')}
                </Button>
              </Form>
              <p className="text-small text-muted-foreground">{t('connections.acceptHint')}</p>
              <details>
                <summary className="cursor-pointer font-semibold text-primary">
                  {t('connections.reject')}
                </summary>
                <Form method="post" className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="intent" value="reject" />
                  <TextAreaField
                    name="note"
                    label={t('connections.rejectNote')}
                    hint={t('connections.rejectNoteHint')}
                    rows={3}
                    maxLength={500}
                  />
                  <Button type="submit" variant="secondary" disabled={busy}>
                    {t('connections.rejectConfirm')}
                  </Button>
                </Form>
              </details>
            </Card>
          )}

          {detail.conversationId && (
            <Card className="gap-3">
              <h2 className="text-h3">{t('connections.chatTitle')}</h2>
              <p className="text-small text-muted-foreground">
                {detail.status === 'cancelled'
                  ? t('connections.chatReadOnly')
                  : t('connections.chatLead')}
              </p>
              <Link
                to={`${PATHS.messages}/${detail.conversationId}`}
                className={buttonVariants({ variant: 'secondary', block: true })}
              >
                <MessageSquare aria-hidden="true" />
                {t('connections.openChat')}
              </Link>
            </Card>
          )}

          {(detail.status === 'pending' && detail.isSender) || detail.status === 'negotiating' ? (
            <Card className="gap-3">
              <Form
                method="post"
                onSubmit={confirmOn(
                  detail.status === 'pending'
                    ? t('connections.confirmWithdraw')
                    : t('connections.confirmEnd'),
                )}
              >
                <input type="hidden" name="intent" value="cancel" />
                <Button type="submit" variant="ghost" disabled={busy} className="px-0">
                  {detail.status === 'pending' ? t('connections.withdraw') : t('connections.end')}
                </Button>
              </Form>
            </Card>
          ) : null}

          <Card className="gap-3">
            <h2 className="text-label">{t('safety.title')}</h2>
            <SafetyActions
              name={name}
              blockTarget={blockTarget}
              reportTarget={reportTarget}
              result={safetyResult}
              busy={busy}
            />
            {!blockTarget && (
              <p className="text-small text-muted-foreground">{t('safety.afterAccept')}</p>
            )}
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
