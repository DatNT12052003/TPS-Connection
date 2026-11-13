// /app/account: hồ sơ phụ huynh (tỉnh/thành, xã/phường, địa chỉ), theo phần "Thông tin cá nhân" của canvas
// Settings. Đợt 3 thêm các mục còn lại của canvas (họ tên, số điện thoại, ảnh đại diện, mật khẩu…) vào
// cùng trang. Địa chỉ là riêng tư: chỉ phụ huynh thấy (API không có endpoint đọc hồ sơ phụ huynh khác).
import { ParentProfile } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { data, Form, useNavigation } from 'react-router';
import { LocationFields } from '~/components/forms/location-fields';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { type CatalogOption, catalogIdFrom } from '~/lib/catalog';
import { communesFor, loadCommunes, loadProvinces } from '~/lib/catalog.server';
import { fieldErrorsFrom, type FormFailure, formErrorFrom, formText } from '~/lib/form';
import { messagesFromMatches } from '~/lib/meta';
import { readPreferences } from '~/lib/preferences';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import type { Route } from './+types/account';

const FIELDS = ['provinceId', 'communeId', 'addressLine'] as const;
type Field = (typeof FIELDS)[number];
type ActionResult =
  | { ok: true }
  | (FormFailure<Field> & { values: Record<Field, string>; communes: CatalogOption[] });

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.account.title} – ${m.common.appName}` }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const { locale } = await readPreferences(request);
  const profile = await getServerApi(context).call('/api/v1/me/parent-profile', {
    schema: ParentProfile,
  });
  const [provinces, communes] = await Promise.all([
    loadProvinces(context, locale),
    loadCommunes(context, locale, profile.provinceId),
  ]);
  return { profile, provinces, communes };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['parent'] });
  const form = await request.formData();
  const values = {
    provinceId: formText(form, 'provinceId'),
    communeId: formText(form, 'communeId'),
    addressLine: formText(form, 'addressLine'),
  };
  try {
    await getServerApi(context).call('/api/v1/me/parent-profile', {
      method: 'PUT',
      body: {
        provinceId: catalogIdFrom(values.provinceId),
        communeId: catalogIdFrom(values.communeId),
        addressLine: values.addressLine,
      },
      schema: ParentProfile,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<ActionResult>({
      ok: false,
      fieldErrors: fieldErrorsFrom(error, FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
      communes: await communesFor(request, context, values.provinceId),
    });
  }
  return data<ActionResult>({ ok: true });
}

export default function AccountPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const tr = useMessage();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const { profile } = loaderData;
  const failure = actionData && !actionData.ok ? actionData : undefined;
  const values = failure?.values ?? {
    provinceId: profile.provinceId === null ? '' : String(profile.provinceId),
    communeId: profile.communeId === null ? '' : String(profile.communeId),
    addressLine: profile.addressLine ?? '',
  };
  const communes =
    failure && catalogIdFrom(failure.values.provinceId) !== profile.provinceId
      ? failure.communes
      : loaderData.communes;

  return (
    <PageContainer className="max-w-3xl">
      <h1 className="text-h1">{t('account.title')}</h1>

      {actionData?.ok && (
        <Alert variant="success" role="status">
          {t('account.saved')}
        </Alert>
      )}
      {failure?.formError && (
        <Alert variant="danger" role="alert">
          {tr(failure.formError)}
        </Alert>
      )}

      <Card className="gap-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3">{t('account.areaTitle')}</h2>
          <p className="text-small text-muted-foreground">{t('account.areaIntro')}</p>
        </div>
        <Form method="post" noValidate className="flex flex-col gap-4">
          <div key={profile.updatedAt ?? 'new'} className="grid gap-4 md:grid-cols-2">
            <LocationFields
              provinces={loaderData.provinces}
              communes={communes}
              provinceId={values.provinceId}
              communeId={values.communeId}
              provinceError={tr(failure?.fieldErrors.provinceId)}
              communeError={tr(failure?.fieldErrors.communeId)}
            />
            <TextField
              name="addressLine"
              maxLength={300}
              autoComplete="street-address"
              className="md:col-span-2"
              label={t('account.address')}
              hint={t('account.addressHint')}
              defaultValue={values.addressLine}
              error={tr(failure?.fieldErrors.addressLine)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {t('account.save')}
            </Button>
          </div>
        </Form>
      </Card>
    </PageContainer>
  );
}
