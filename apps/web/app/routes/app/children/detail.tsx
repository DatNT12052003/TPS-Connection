// /app/children/:learnerId: phụ huynh xem và sửa hồ sơ một con. Chưa có trên canvas (G1b mục 4): dựng theo
// màn tạo hồ sơ con (ChildProfile), thêm thẻ tài khoản học sinh và xóa hồ sơ ở cột bên.
// Không quản lý hồ sơ này (hoặc không tồn tại): 404, giống API (không để lộ hồ sơ có tồn tại).
import { Learner } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { LearnerFormFields, LearnerPrivacyAside } from '~/components/learners/learner-form';
import { StudentAccountStatus } from '~/components/learners/student-account-status';
import { Alert } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ApiError } from '~/lib/api';
import { catalogIdFrom } from '~/lib/catalog';
import { communesFor, loadCommunes, loadGradeLevels, loadProvinces } from '~/lib/catalog.server';
import { fieldErrorsFrom, formErrorFrom, formText, type Message } from '~/lib/form';
import {
  LEARNER_FIELDS,
  type LearnerFormFailure,
  learnerBody,
  learnerFormValues,
  learnerName,
  learnerValuesFrom,
} from '~/lib/learners';
import { learnerIdFrom, loadOwnLearner } from '~/lib/learners.server';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/detail';

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  const name = loaderData ? learnerName(loaderData.learner) : m.learnerForm.editTitle;
  return [{ title: `${name} – ${m.common.appName}` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const learner = await loadOwnLearner(request, context, learnerIdFrom(params));
  const { locale } = await readPreferences(request);
  const [gradeLevels, provinces, communes] = await Promise.all([
    loadGradeLevels(context, locale),
    loadProvinces(context, locale),
    loadCommunes(context, locale, learner.provinceId),
  ]);
  return { learner, gradeLevels, provinces, communes };
}

type ActionResult =
  { ok: true; saved: true } | LearnerFormFailure | { ok: false; formError: Message };

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const learnerId = learnerIdFrom(params);
  const form = await request.formData();
  const api = getServerApi(context);

  if (formText(form, 'intent') === 'delete') {
    try {
      await api.call(`/api/v1/learners/${learnerId}`, { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
      return data<ActionResult>({ ok: false, formError: formErrorFrom(error) });
    }
    return redirect(`${PATHS.app}?deleted=1`);
  }

  const values = learnerValuesFrom(form);
  try {
    await api.call(`/api/v1/learners/${learnerId}`, {
      method: 'PATCH',
      body: learnerBody(values),
      schema: Learner,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<ActionResult>({
      ok: false,
      fieldErrors: fieldErrorsFrom(error, LEARNER_FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
      communes: await communesFor(request, context, values.provinceId),
    });
  }
  return data<ActionResult>({ ok: true, saved: true });
}

export default function ChildDetailPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const busyIntent =
    navigation.state !== 'idle' && navigation.formMethod === 'POST'
      ? (navigation.formData?.get('intent') ?? 'save')
      : null;
  const { learner } = loaderData;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const formFailure = failure && 'values' in failure ? failure : undefined;
  const values = formFailure?.values ?? learnerFormValues(learner);
  const communes =
    formFailure && catalogIdFrom(formFailure.values.provinceId) !== learner.provinceId
      ? formFailure.communes
      : loaderData.communes;
  const name = learnerName(learner);

  return (
    <PageContainer>
      <div className="flex flex-col gap-1.5">
        <nav aria-label={t('layout.breadcrumb')} className="text-small text-muted-foreground">
          <Link to={PATHS.app} className="hover:text-foreground">
            {t('nav.home')}
          </Link>
          <span aria-hidden="true"> › </span>
          <span>{name}</span>
        </nav>
        <h1 className="text-h1">{name}</h1>
        <p className="text-muted-foreground">{t('learnerForm.editIntro')}</p>
      </div>

      {actionData?.ok && (
        <Alert variant="success" role="status">
          {t('learnerForm.saved')}
        </Alert>
      )}
      {failure?.formError && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError)}
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Form method="post" noValidate className="flex flex-col gap-4 md:gap-6">
          <LearnerFormFields
            // Lưu xong thì dựng lại các ô theo hồ sơ mới (ô không điều khiển giữ giá trị cũ).
            key={learner.updatedAt}
            catalogs={{
              gradeLevels: loaderData.gradeLevels,
              provinces: loaderData.provinces,
              communes,
            }}
            values={values}
            errors={formFailure?.fieldErrors ?? {}}
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link to={PATHS.app} className={buttonVariants({ variant: 'secondary' })}>
              {t('common.back')}
            </Link>
            <Button
              type="submit"
              name="intent"
              value="save"
              disabled={busyIntent !== null}
              aria-busy={busyIntent === 'save'}
            >
              {t('learnerForm.saveChanges')}
            </Button>
          </div>
        </Form>

        <aside className="flex flex-col gap-4">
          <Card className="gap-3">
            <h2 className="text-h3">{t('invite.accountTitle')}</h2>
            <StudentAccountStatus learner={learner} />
          </Card>
          <LearnerPrivacyAside />
          {!learner.hasStudentAccount && (
            <Card className="gap-3">
              <h2 className="text-h3">{t('learnerForm.deleteTitle')}</h2>
              <p className="text-small text-muted-foreground">{t('learnerForm.deleteBody')}</p>
              <Form
                method="post"
                onSubmit={(event) => {
                  if (!window.confirm(t('learnerForm.deleteConfirm', { name }))) {
                    event.preventDefault();
                  }
                }}
              >
                <Button
                  type="submit"
                  name="intent"
                  value="delete"
                  variant="danger"
                  disabled={busyIntent !== null}
                  aria-busy={busyIntent === 'delete'}
                >
                  {t('learnerForm.delete')}
                </Button>
              </Form>
            </Card>
          )}
        </aside>
      </div>
    </PageContainer>
  );
}
