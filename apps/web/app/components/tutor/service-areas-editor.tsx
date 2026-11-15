// Khu vực dạy trực tiếp (canvas TutorProfileEdit, "Hình thức và khu vực"): chọn tỉnh, rồi chọn cả tỉnh hoặc
// một xã/phường và bấm Thêm. Mỗi khu vực là một chip bỏ được. Gửi trong ô ẩn `serviceAreaIds` dạng JSON.
// Xã của tỉnh tải qua route dữ liệu /catalog/provinces/:id/communes (như LocationFields).
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { SelectField } from '~/components/ui/field';
import type { AreaRef, CatalogOption } from '~/lib/catalog';
import { TUTOR_PROFILE_LIMITS } from '@tps/shared';

/** Giá trị ô xã khi muốn dạy cả tỉnh. */
const WHOLE_PROVINCE = 'all';

export function ServiceAreasEditor({
  provinces,
  initial,
  error,
}: {
  provinces: readonly CatalogOption[];
  initial: readonly AreaRef[];
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const [areas, setAreas] = useState<AreaRef[]>([...initial]);
  const [provinceId, setProvinceId] = useState('');
  const [communeId, setCommuneId] = useState(WHOLE_PROVINCE);
  const fetcher = useFetcher<{ items: CatalogOption[] }>();
  const communes = provinceId ? (fetcher.data?.items ?? []) : [];
  const provinceLabel = (id: number) => provinces.find((p) => p.id === id)?.label ?? '';
  const full = areas.length >= TUTOR_PROFILE_LIMITS.serviceAreas;

  function chipLabel(area: AreaRef) {
    return area.level === 'province'
      ? t('tutorProfile.wholeProvince', { province: area.label })
      : `${area.label}, ${provinceLabel(area.provinceId)}`;
  }

  function add() {
    const province = Number(provinceId);
    if (!province) return;
    const next: AreaRef | undefined =
      communeId === WHOLE_PROVINCE
        ? { id: province, label: provinceLabel(province), level: 'province', provinceId: province }
        : (() => {
            const commune = communes.find((c) => c.id === Number(communeId));
            return commune && { ...commune, level: 'commune' as const, provinceId: province };
          })();
    if (!next || areas.some((a) => a.id === next.id)) return;
    setAreas((current) => [...current, next]);
    setCommuneId(WHOLE_PROVINCE);
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="serviceAreaIds" value={JSON.stringify(areas.map((a) => a.id))} />
      <span className="text-label">{t('tutorProfile.areasLabel')}</span>
      {areas.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t('tutorProfile.areasLabel')}>
          {areas.map((area) => {
            const label = chipLabel(area);
            return (
              <li
                key={area.id}
                className="inline-flex min-h-10 items-center gap-1 rounded-full bg-primary-subtle py-1 pr-1 pl-3.5 text-small font-semibold text-primary-subtle-foreground"
              >
                {label}
                <button
                  type="button"
                  aria-label={t('tutorProfile.removeArea', { area: label })}
                  className="flex size-8 items-center justify-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setAreas((current) => current.filter((a) => a.id !== area.id))}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-small text-muted-foreground">{t('tutorProfile.areasEmpty')}</p>
      )}
      {error && <span className="text-small font-medium text-danger">{error}</span>}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SelectField
          label={t('location.province')}
          value={provinceId}
          disabled={full}
          onChange={(event) => {
            setProvinceId(event.target.value);
            setCommuneId(WHOLE_PROVINCE);
            if (event.target.value) {
              void fetcher.load(`/catalog/provinces/${event.target.value}/communes`);
            }
          }}
        >
          <option value="">{t('location.choose')}</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          key={provinceId}
          label={t('location.commune')}
          value={communeId}
          disabled={!provinceId || fetcher.state !== 'idle' || full}
          onChange={(event) => setCommuneId(event.target.value)}
        >
          <option value={WHOLE_PROVINCE}>{t('tutorProfile.wholeProvinceOption')}</option>
          {communes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <Button type="button" variant="secondary" disabled={!provinceId || full} onClick={add}>
          <Plus aria-hidden="true" />
          {t('tutorProfile.addArea')}
        </Button>
      </div>
    </div>
  );
}
