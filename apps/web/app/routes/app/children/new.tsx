// /app/children/new, theo canvas ChildProfile / ChildProfileMobile: phụ huynh tạo hồ sơ con. Phải đồng ý cho
// nền tảng xử lý dữ liệu của con (API ghi `user_consents` loại child_data_processing). Lưu xong sang màn
// mời con tạo tài khoản (canvas InviteStudent), kèm thông báo đã lưu.
import { Learner } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { PageContainer } from '~/components/layout/page';
import { LearnerFormFields, LearnerPrivacyAside } from '~/components/learners/learner-form';
import { Alert } from '~/components/ui/alert';
import { Button, buttonVariants } from '~/components/ui/button';
import { CheckboxField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { communesFor, loadGradeLevels, loadProvinces } from '~/lib/catalog.server';
import { fieldErrorsFrom, formErrorFrom } from '~/lib/form';
import {
  CONSENT_FIELD,
  EMPTY_LEARNER_VALUES,
  LEARNER_FIELDS,
  type LearnerField,
  type LearnerFormFailure,
  learnerBody,
  learnerValuesFrom,
} from '~/lib/learners';
import { messagesFromMatches } from '~/lib/meta';
import { PATHS } from '~/lib/navigation';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/new';

type Field = LearnerField | typeof CONSENT_FIELD;
const FIELDS: readonly Field[] = [...LEARNER_FIELDS, CONSENT_FIELD];

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.learnerForm.createTitle} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const { locale } = await readPreferences(request);
  const [gradeLevels, provinces] = await Promise.all([
    loadGradeLevels(context, locale),
    loadProvinces(context, locale),
  ]);
  return { gradeLevels, provinces };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const form = await request.formData();
  const values = learnerValuesFrom(form);
  let learnerId: string;
  try {
    const learner = await getServerApi(context).call('/api/v1/learners', {
      method: 'POST',
      body: { ...learnerBody(values), [CONSENT_FIELD]: form.get(CONSENT_FIELD) === 'on' },
      schema: Learner,
    });
    learnerId = learner.id;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<LearnerFormFailure<Field>>({
      ok: false,
      fieldErrors: fieldErrorsFrom(error, FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
      communes: await communesFor(request, context, values.provinceId),
    });
  }
  return redirect(`${PATHS.children}/${learnerId}/invite?created=1`);
}

export default function NewChildPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const failure = actionData;
  const values = failure?.values ?? EMPTY_LEARNER_VALUES;

  return (
    <PageContainer>
      <div className="flex flex-col gap-1.5">
        <nav aria-label={t('layout.breadcrumb')} className="text-small text-muted-foreground">
          <Link to={PATHS.app} className="hover:text-foreground">
            {t('nav.home')}
          </Link>
          <span aria-hidden="true"> › </span>
          <span>{t('learnerForm.createTitle')}</span>
        </nav>
        <h1 className="text-h1">{t('learnerForm.createTitle')}</h1>
        <p className="text-muted-foreground">{t('learnerForm.createIntro')}</p>
      </div>

      {failure?.formError && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError)}
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Form method="post" noValidate className="flex flex-col gap-4 md:gap-6">
          <LearnerFormFields
            catalogs={{ ...loaderData, communes: failure?.communes ?? [] }}
            values={values}
            errors={failure?.fieldErrors ?? {}}
          />
          <CheckboxField
            name={CONSENT_FIELD}
            required
            error={tr(failure?.fieldErrors[CONSENT_FIELD])}
          >
            {t('learnerForm.consent')}
          </CheckboxField>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link to={PATHS.app} className={buttonVariants({ variant: 'secondary' })}>
              {t('common.cancel')}
            </Link>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {t('learnerForm.save')}
            </Button>
          </div>
        </Form>

        <aside className="flex flex-col gap-4">
          <LearnerPrivacyAside />
          <Alert>{t('learnerForm.accountNote')}</Alert>
        </aside>
      </div>
    </PageContainer>
  );
}
