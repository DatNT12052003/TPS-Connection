import type { Locale } from '@tps/shared';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { createI18n } from '~/lib/i18n';

/** Render một component trong context router + i18n, như trong app. */
export function renderWithProviders(
  ui: ReactElement,
  { path = '/', locale = 'vi' }: { path?: string; locale?: Locale } = {},
) {
  const Stub = createRoutesStub([{ path: '*', Component: () => ui }]);
  return render(
    <I18nextProvider i18n={createI18n(locale)}>
      <Stub initialEntries={[path]} />
    </I18nextProvider>,
  );
}
