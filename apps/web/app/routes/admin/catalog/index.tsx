// /admin/catalog: danh mục môn học và khối lớp của Admin (canvas AdminCatalog).
//   ?tab=subjects|grades chọn danh mục; ?edit=new|<id> mở form thêm / sửa (chạy được khi chưa tải JavaScript).
//   Intent `save` (thêm hoặc sửa tên, thứ tự; khối lớp có thêm cấp học khi thêm), `toggle` (bật/tắt).
// Không xóa: mục đã có dữ liệu chỉ tắt được. Tỉnh/xã nạp từ bộ dữ liệu chính thức, không sửa ở đây.
import { AdminGradeLevel, AdminSubject, GradeStage } from '@tps/shared';
import { Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { z } from 'zod';
import { PageContainer } from '~/components/layout/page';
import { Alert } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { SelectField, TextField } from '~/components/ui/field';
import { ApiError } from '~/lib/api';
import { type FormFailure, fieldErrorsFrom, formErrorFrom, formText } from '~/lib/form';
import { messagesFromMatches } from '~/lib/meta';
import { getServerApi } from '~/lib/server-api.server';
import { requireUser } from '~/lib/session.server';
import { useMessage } from '~/lib/use-message';
import { cn } from '~/lib/utils';
import type { Route } from './+types/index';

export function meta({ matches }: Route.MetaArgs) {
  const m = messagesFromMatches(matches);
  return [{ title: `${m.adminCatalog.title} – ${m.common.appName}` }];
}

type Tab = 'subjects' | 'grades';
const API_PATH: Record<Tab, string> = {
  subjects: '/api/v1/admin/catalog/subjects',
  grades: '/api/v1/admin/catalog/grade-levels',
};
const FIELDS = ['code', 'stage', 'nameVi', 'nameEn', 'sortOrder'] as const;
type Field = (typeof FIELDS)[number];
type Item = AdminSubject & { stage?: AdminGradeLevel['stage'] };

const tabOf = (value: string | null): Tab => (value === 'grades' ? 'grades' : 'subjects');

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context, { roles: ['admin'] });
  const url = new URL(request.url);
  const tab = tabOf(url.searchParams.get('tab'));
  const api = getServerApi(context);
  const items: Item[] =
    tab === 'subjects'
      ? (await api.call(API_PATH.subjects, { schema: z.object({ items: z.array(AdminSubject) }) }))
          .items
      : (
          await api.call(API_PATH.grades, {
            schema: z.object({ items: z.array(AdminGradeLevel) }),
          })
        ).items;
  return {
    tab,
    items,
    editing: url.searchParams.get('edit'),
    saved: url.searchParams.get('saved') === '1',
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context, { roles: ['admin'] });
  const form = await request.formData();
  const tab = tabOf(formText(form, 'tab'));
  const intent = formText(form, 'intent');
  const id = formText(form, 'id');
  const api = getServerApi(context);
  const schema = tab === 'subjects' ? AdminSubject : AdminGradeLevel;
  const values = Object.fromEntries(FIELDS.map((f) => [f, formText(form, f)])) as Record<
    Field,
    string
  >;
  try {
    if (intent === 'toggle') {
      await api.call(`${API_PATH[tab]}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { isActive: formText(form, 'isActive') === 'true' },
        schema,
      });
    } else if (intent === 'save') {
      const sort = values.sortOrder.trim();
      // Gõ chữ vào ô thứ tự thì gửi nguyên văn để API báo lỗi đúng ô.
      const sortOrder = sort === '' ? undefined : /^\d+$/.test(sort) ? Number(sort) : sort;
      const names = { nameVi: values.nameVi, nameEn: values.nameEn, sortOrder };
      await api.call(id ? `${API_PATH[tab]}/${encodeURIComponent(id)}` : API_PATH[tab], {
        method: id ? 'PATCH' : 'POST',
        body: id
          ? names
          : { ...names, code: values.code, ...(tab === 'grades' && { stage: values.stage }) },
        schema,
      });
    } else {
      throw data(null, { status: 400 });
    }
    return redirect(`/admin/catalog?tab=${tab}&saved=1`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) throw error;
    return data<FormFailure<Field>>({
      ok: false,
      fieldErrors: fieldErrorsFrom(error, FIELDS),
      ...(error.code !== 'validation_failed' && { formError: formErrorFrom(error) }),
      values,
    });
  }
}

export default function AdminCatalogPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const tr = useMessage();
  const { tab, items, editing, saved } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const nameOf = (item: Item) => (i18n.language === 'en' ? item.nameEn : item.nameVi);
  const editingItem = items.find((item) => String(item.id) === editing);

  return (
    <PageContainer>
      <h1 className="text-h1">{t('adminCatalog.title')}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={t('adminCatalog.sections')} className="flex gap-1 lg:flex-col">
          {(['subjects', 'grades'] as const).map((value) => (
            <Link
              key={value}
              to={`?tab=${value}`}
              aria-current={tab === value ? 'page' : undefined}
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'justify-start aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-subtle-foreground',
              )}
            >
              {t(value === 'subjects' ? 'adminCatalog.subjects' : 'adminCatalog.gradeLevels')}
            </Link>
          ))}
        </nav>

        <Card className="min-w-0 gap-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-h3">
              {t(tab === 'subjects' ? 'adminCatalog.subjects' : 'adminCatalog.gradeLevels')}
            </h2>
            {editing !== 'new' && (
              <Link
                to={`?tab=${tab}&edit=new`}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <Plus aria-hidden="true" />
                {t(tab === 'subjects' ? 'adminCatalog.addSubject' : 'adminCatalog.addGradeLevel')}
              </Link>
            )}
          </div>
          {saved && (
            <Alert variant="success" role="status">
              {t('adminCatalog.saved')}
            </Alert>
          )}
          {actionData?.formError && (
            <Alert variant="danger" role="alert">
              {tr(actionData.formError)}
            </Alert>
          )}

          {(editing === 'new' || editingItem) && (
            <ItemForm tab={tab} item={editingItem} failure={actionData ?? undefined} busy={busy} />
          )}

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-left text-small">
              <thead className="bg-surface-sunken text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t('adminCatalog.nameVi')}</th>
                  <th className="px-3 py-2 font-semibold">{t('adminCatalog.nameEn')}</th>
                  {tab === 'grades' && (
                    <th className="px-3 py-2 font-semibold">{t('adminCatalog.stage')}</th>
                  )}
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('adminCatalog.tutorCount')}
                  </th>
                  <th className="px-3 py-2 font-semibold">{t('adminCatalog.visible')}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{t('adminCatalog.edit')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-semibold">{item.nameVi}</td>
                    <td className="px-3 py-2">{item.nameEn}</td>
                    {tab === 'grades' && (
                      <td className="px-3 py-2">{item.stage && t(`gradeStage.${item.stage}`)}</td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums">{item.tutorCount}</td>
                    <td className="px-3 py-2">
                      <Form method="post" className="flex items-center gap-2">
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="tab" value={tab} />
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="isActive" value={String(!item.isActive)} />
                        <Badge variant={item.isActive ? 'success' : 'neutral'}>
                          {t(item.isActive ? 'adminCatalog.on' : 'adminCatalog.off')}
                        </Badge>
                        <Button type="submit" variant="ghost" disabled={busy}>
                          {t(item.isActive ? 'adminCatalog.turnOff' : 'adminCatalog.turnOn', {
                            name: nameOf(item),
                          })}
                        </Button>
                      </Form>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`?tab=${tab}&edit=${item.id}`}
                        aria-label={t('adminCatalog.editNamed', { name: nameOf(item) })}
                        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                      >
                        <Pencil aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-small text-muted-foreground">{t('adminCatalog.noDelete')}</p>
          <p className="text-small text-muted-foreground">{t('adminCatalog.areasNote')}</p>
        </Card>
      </div>
    </PageContainer>
  );
}

function ItemForm({
  tab,
  item,
  failure,
  busy,
}: {
  tab: Tab;
  item: Item | undefined;
  failure: FormFailure<Field> | undefined;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const errors = failure?.fieldErrors ?? {};
  const values = failure?.values ?? {
    code: item?.code ?? '',
    stage: item?.stage ?? 'other',
    nameVi: item?.nameVi ?? '',
    nameEn: item?.nameEn ?? '',
    sortOrder: item ? String(item.sortOrder) : '',
  };
  return (
    <Form method="post" noValidate className="flex flex-col gap-4 rounded-md bg-surface-sunken p-4">
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="tab" value={tab} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <h3 className="text-body-strong">
        {item
          ? t('adminCatalog.editTitle', { name: item.nameVi })
          : t(tab === 'subjects' ? 'adminCatalog.addSubject' : 'adminCatalog.addGradeLevel')}
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        {!item && (
          <TextField
            name="code"
            required
            maxLength={40}
            autoComplete="off"
            label={t('adminCatalog.code')}
            hint={t('adminCatalog.codeHint')}
            defaultValue={values.code}
            error={tr(errors.code)}
          />
        )}
        {!item && tab === 'grades' && (
          <SelectField
            name="stage"
            label={t('adminCatalog.stage')}
            defaultValue={values.stage}
            error={tr(errors.stage)}
          >
            {GradeStage.options.map((stage) => (
              <option key={stage} value={stage}>
                {t(`gradeStage.${stage}`)}
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          name="nameVi"
          required
          maxLength={100}
          label={t('adminCatalog.nameVi')}
          defaultValue={values.nameVi}
          error={tr(errors.nameVi)}
        />
        <TextField
          name="nameEn"
          required
          maxLength={100}
          label={t('adminCatalog.nameEn')}
          defaultValue={values.nameEn}
          error={tr(errors.nameEn)}
        />
        <TextField
          name="sortOrder"
          inputMode="numeric"
          maxLength={5}
          label={t('adminCatalog.sortOrder')}
          defaultValue={values.sortOrder}
          error={tr(errors.sortOrder)}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Link to={`?tab=${tab}`} className={buttonVariants({ variant: 'secondary' })}>
          {t('common.cancel')}
        </Link>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {t('adminCatalog.save')}
        </Button>
      </div>
    </Form>
  );
}
