// Cặp ô chọn tỉnh/thành và xã/phường (D9: hai cấp hành chính). Đổi tỉnh thì tải danh sách xã của tỉnh mới
// qua route dữ liệu /catalog/provinces/:id/communes và bỏ xã đã chọn. Danh sách xã ban đầu do loader trang
// đưa vào (xã của tỉnh đang lưu), nên trang vẫn đúng khi chưa tải JavaScript.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { SelectField } from '~/components/ui/field';
import type { CatalogOption } from '~/lib/catalog';

interface LocationFieldsProps {
  provinces: readonly CatalogOption[];
  /** Xã của tỉnh `provinceId` ban đầu. */
  communes: readonly CatalogOption[];
  provinceId: string;
  communeId: string;
  provinceError?: string | undefined;
  communeError?: string | undefined;
  /** Gợi ý dưới ô xã (ví dụ ai được thấy khu vực này). */
  hint?: string;
}

export function LocationFields({
  provinces,
  communes: initialCommunes,
  provinceId: initialProvinceId,
  communeId,
  provinceError,
  communeError,
  hint,
}: LocationFieldsProps) {
  const { t } = useTranslation();
  const [provinceId, setProvinceId] = useState(initialProvinceId);
  const fetcher = useFetcher<{ items: CatalogOption[] }>();
  const changed = provinceId !== initialProvinceId;
  const communes = changed ? (fetcher.data?.items ?? []) : initialCommunes;
  const loading = changed && fetcher.state !== 'idle';

  return (
    <>
      <SelectField
        name="provinceId"
        label={t('location.province')}
        value={provinceId}
        onChange={(event) => {
          const next = event.target.value;
          setProvinceId(next);
          if (next) void fetcher.load(`/catalog/provinces/${next}/communes`);
        }}
        error={provinceError}
      >
        <option value="">{t('location.choose')}</option>
        {provinces.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        // Đổi tỉnh thì dựng lại ô xã (bỏ xã của tỉnh cũ).
        key={provinceId}
        name="communeId"
        label={t('location.commune')}
        defaultValue={changed ? '' : communeId}
        disabled={!provinceId || loading}
        aria-busy={loading || undefined}
        error={communeError}
        hint={hint}
      >
        <option value="">{loading ? t('common.loading') : t('location.choose')}</option>
        {communes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </SelectField>
    </>
  );
}
