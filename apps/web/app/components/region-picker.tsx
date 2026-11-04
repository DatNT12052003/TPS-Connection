import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import type { CatalogName } from '~/lib/catalog.server';
import { translate, type Locale } from '~/lib/i18n';

const nameOf = (item: CatalogName, locale: Locale) => (locale === 'vi' ? item.nameVi : item.nameEn);

function ProvinceRow({
  locale,
  province,
  selected,
  initialCommunes,
}: {
  locale: Locale;
  province: CatalogName;
  selected: Set<string>;
  /** Present for provinces already on the profile, so saving cannot race the fetch. */
  initialCommunes?: CatalogName[];
}) {
  const [checked, setChecked] = useState(selected.has(province.id));
  const fetcher = useFetcher<{ communes: CatalogName[] }>();
  const communes = initialCommunes ?? fetcher.data?.communes;

  useEffect(() => {
    if (checked && !communes && fetcher.state === 'idle') {
      void fetcher.load(`/catalog/communes?parentId=${province.id}`);
    }
  }, [checked, communes, fetcher, province.id]);

  return (
    <li className="py-1">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="regionIds"
          value={province.id}
          defaultChecked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        {nameOf(province, locale)}
      </label>
      {checked && communes && communes.length > 0 && (
        <ul className="mt-1 ml-6">
          {communes.map((commune) => (
            <li key={commune.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="regionIds"
                  value={commune.id}
                  defaultChecked={selected.has(commune.id)}
                />
                {nameOf(commune, locale)}
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function RegionPicker({
  locale,
  provinces,
  selectedIds,
  initialCommunes,
}: {
  locale: Locale;
  provinces: CatalogName[];
  selectedIds: string[];
  initialCommunes: Record<string, CatalogName[]>;
}) {
  const selected = new Set(selectedIds);
  const shown = new Set([
    ...provinces.map((item) => item.id),
    ...Object.values(initialCommunes).flatMap((items) => items.map((item) => item.id)),
  ]);
  return (
    <fieldset className="mt-4">
      <legend className="font-medium">{translate(locale, 'tutor.regions')}</legend>
      <p className="text-sm text-slate-600">{translate(locale, 'tutor.regionsHint')}</p>
      {/* Entries switched off since they were chosen stay on the profile (AC-MOD-05.2). */}
      {selectedIds
        .filter((id) => !shown.has(id))
        .map((id) => (
          <input key={id} type="hidden" name="regionIds" value={id} />
        ))}
      <ul className="mt-1">
        {provinces.map((province) => (
          <ProvinceRow
            key={province.id}
            locale={locale}
            province={province}
            selected={selected}
            initialCommunes={initialCommunes[province.id]}
          />
        ))}
      </ul>
    </fieldset>
  );
}
