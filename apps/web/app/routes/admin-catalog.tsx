import { Form, Link } from 'react-router';
import type { Route } from './+types/admin-catalog';
import { AuthPage, CsrfField, FormAlert, Notice, privatePageMeta } from '~/components/auth-ui';
import { formApi, userApi } from '~/lib/api.server';
import { toFormResult, type FormResult } from '~/lib/form-errors';
import { localeOf, translate, type MessageKey } from '~/lib/i18n';
import { csrfTokenOf, redirectToRefresh, requireAccount } from '~/lib/session.server';

const KINDS = ['subjects', 'grades', 'regions'] as const;
type Kind = (typeof KINDS)[number];

const kindOf = (value: string | null): Kind =>
  KINDS.includes(value as Kind) ? (value as Kind) : 'subjects';

const KIND_LABEL: Record<Kind, MessageKey> = {
  subjects: 'admin.subjects',
  grades: 'admin.grades',
  regions: 'admin.regions',
};

export const meta: Route.MetaFunction = ({ params }) =>
  privatePageMeta(localeOf(params.lang), 'admin.title');

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'private, no-store' });

export async function loader({ request }: Route.LoaderArgs) {
  const account = await requireAccount(request);
  // Only hides the page. The API refuses everyone else on its own.
  if (account.role !== 'admin') throw new Response('Not found', { status: 404 });

  const url = new URL(request.url);
  const kind = kindOf(url.searchParams.get('kind'));
  const parentId = url.searchParams.get('parent') ?? undefined;
  const requested = Number(url.searchParams.get('page'));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  const api = userApi(request);
  const query = { page, limit: 50 };
  const result =
    kind === 'subjects'
      ? await api.GET('/api/v1/admin/catalog/subjects', { params: { query } })
      : kind === 'grades'
        ? await api.GET('/api/v1/admin/catalog/grades', { params: { query } })
        : await api.GET('/api/v1/admin/catalog/regions', {
            params: { query: { ...query, parentId } },
          });
  if (!result.data) throw new Response('Unavailable', { status: 503 });
  return {
    kind,
    parentId: kind === 'regions' ? (parentId ?? null) : null,
    items: result.data.data as {
      id: string;
      nameVi: string;
      nameEn: string;
      isActive: boolean;
      code?: string;
      level?: string;
    }[],
    page: result.data.page,
    csrf: csrfTokenOf(request),
  };
}

export async function action({ request }: Route.ActionArgs): Promise<FormResult | { ok: true }> {
  const form = await request.formData();
  const api = formApi(request, form);
  const kind = kindOf(String(form.get('kind')));
  const nameVi = String(form.get('nameVi') ?? '');
  const nameEn = String(form.get('nameEn') ?? '');

  let outcome: { error?: unknown; response: Response };
  if (form.get('intent') === 'update') {
    const params = { path: { id: String(form.get('id')) } };
    const body = { nameVi, nameEn, isActive: form.get('isActive') === 'on' };
    outcome =
      kind === 'subjects'
        ? await api.PATCH('/api/v1/admin/catalog/subjects/{id}', { params, body })
        : kind === 'grades'
          ? await api.PATCH('/api/v1/admin/catalog/grades/{id}', { params, body })
          : await api.PATCH('/api/v1/admin/catalog/regions/{id}', { params, body });
  } else if (kind === 'subjects') {
    outcome = await api.POST('/api/v1/admin/catalog/subjects', { body: { nameVi, nameEn } });
  } else if (kind === 'grades') {
    outcome = await api.POST('/api/v1/admin/catalog/grades', {
      body: { nameVi, nameEn, sortOrder: Number(form.get('sortOrder')) },
    });
  } else {
    const parentId = String(form.get('parentId') ?? '');
    outcome = await api.POST('/api/v1/admin/catalog/regions', {
      body: {
        nameVi,
        nameEn,
        code: String(form.get('code') ?? ''),
        ...(parentId ? { parentId } : {}),
      },
    });
  }
  if (outcome.response.status === 401) throw redirectToRefresh(request);
  if (outcome.response.ok) return { ok: true };
  return toFormResult(outcome.error as Parameters<typeof toFormResult>[0]);
}

const inputClass = 'w-full rounded border border-slate-400 p-1';

export default function AdminCatalog({ params, loaderData, actionData }: Route.ComponentProps) {
  const locale = localeOf(params.lang);
  const { kind, parentId, items, page, csrf } = loaderData;
  const t = (key: MessageKey) => translate(locale, key);
  const result = actionData && !actionData.ok ? actionData : undefined;
  const fieldProblem = result && Object.values(result.fieldErrors)[0];
  const here = (extra: string) => `?kind=${kind}${parentId ? `&parent=${parentId}` : ''}${extra}`;

  return (
    <AuthPage locale={locale} title="admin.title">
      <p className="mt-2">
        <Link className="underline" to={`/${locale}/account`}>
          {t('nav.back')}
        </Link>
      </p>
      <nav className="mt-4 flex gap-4">
        {KINDS.map((item) => (
          <Link
            key={item}
            to={`?kind=${item}`}
            aria-current={item === kind ? 'page' : undefined}
            className={item === kind ? 'font-semibold underline' : 'underline'}
          >
            {t(KIND_LABEL[item])}
          </Link>
        ))}
      </nav>
      {parentId && (
        <p className="mt-2">
          <Link className="underline" to="?kind=regions">
            {t('admin.backToProvinces')}
          </Link>
        </p>
      )}
      {actionData?.ok && <Notice>{t('form.saved')}</Notice>}
      <FormAlert locale={locale} result={result} />
      {fieldProblem && (
        <p role="alert" className="mt-4 text-red-700">
          {t(fieldProblem)}
        </p>
      )}

      <h2 className="mt-6 text-xl font-medium">{t('admin.add')}</h2>
      <Form method="post" className="mt-2 space-y-2">
        <CsrfField token={csrf} />
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="kind" value={kind} />
        {parentId && <input type="hidden" name="parentId" value={parentId} />}
        {kind === 'regions' && (
          <input
            className={inputClass}
            name="code"
            required
            placeholder={t('admin.code')}
            aria-label={t('admin.code')}
          />
        )}
        <input
          className={inputClass}
          name="nameVi"
          required
          placeholder={t('admin.nameVi')}
          aria-label={t('admin.nameVi')}
        />
        <input
          className={inputClass}
          name="nameEn"
          required
          placeholder={t('admin.nameEn')}
          aria-label={t('admin.nameEn')}
        />
        {kind === 'grades' && (
          <input
            className={inputClass}
            name="sortOrder"
            type="number"
            min="0"
            required
            placeholder={t('admin.sortOrder')}
            aria-label={t('admin.sortOrder')}
          />
        )}
        <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-white">
          {t('admin.add')}
        </button>
      </Form>

      <h2 className="mt-6 text-xl font-medium">{t(KIND_LABEL[kind])}</h2>
      {items.length === 0 && <p className="mt-2 text-slate-600">{t('admin.empty')}</p>}
      <ul className="mt-2 divide-y divide-slate-200">
        {items.map((item) => (
          <li key={item.id} className="py-2">
            {/* The key resets the inputs when saved values come back. */}
            <Form
              method="post"
              className="space-y-1"
              key={`${item.nameVi}|${item.nameEn}|${item.isActive}`}
            >
              <CsrfField token={csrf} />
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={item.id} />
              {item.code && <p className="text-sm text-slate-600">{item.code}</p>}
              <input
                className={inputClass}
                name="nameVi"
                required
                defaultValue={item.nameVi}
                aria-label={`${t('admin.nameVi')}: ${item.nameVi}`}
              />
              <input
                className={inputClass}
                name="nameEn"
                required
                defaultValue={item.nameEn}
                aria-label={`${t('admin.nameEn')}: ${item.nameEn}`}
              />
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" name="isActive" defaultChecked={item.isActive} />
                  {t('admin.active')}
                </label>
                <button type="submit" className="underline">
                  {t('profile.save')}
                </button>
              </div>
            </Form>
            {item.level === 'province' && (
              <Link className="text-sm underline" to={`?kind=regions&parent=${item.id}`}>
                {t('admin.communes')}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <nav className="mt-4 flex justify-between">
        {page.number > 1 ? (
          <Link className="underline" to={here(`&page=${page.number - 1}`)}>
            {t('students.prevPage')}
          </Link>
        ) : (
          <span />
        )}
        {page.number * page.limit < page.total && (
          <Link className="underline" to={here(`&page=${page.number + 1}`)}>
            {t('students.nextPage')}
          </Link>
        )}
      </nav>
    </AuthPage>
  );
}
