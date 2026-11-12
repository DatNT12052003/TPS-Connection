import { messages } from '@tps/shared';
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, APP_NAV, MOBILE_NAV_MAX, PUBLIC_NAV, type NavItem } from './navigation';

const allLists: [string, NavItem[]][] = [
  ['public', PUBLIC_NAV],
  ...Object.entries(APP_NAV).flatMap(([role, nav]): [string, NavItem[]][] => [
    [`${role}.desktop`, nav.desktop],
    [`${role}.mobile`, nav.mobile],
  ]),
  ...Object.entries(ADMIN_NAV),
];

describe('navigation', () => {
  it.each(Object.entries(APP_NAV))('%s bottom nav has at most 5 items (D51)', (_role, nav) => {
    expect(nav.mobile.length).toBeLessThanOrEqual(MOBILE_NAV_MAX);
  });

  it.each(allLists)('%s has no duplicate paths', (_name, items) => {
    const paths = items.map((item) => item.to);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(allLists)('%s labels exist in vi and en', (_name, items) => {
    for (const { label } of items) {
      const key = label.replace(/^nav\./, '') as keyof (typeof messages)['vi']['nav'];
      expect(messages.vi.nav[key], label).toBeTruthy();
      expect(messages.en.nav[key], label).toBeTruthy();
    }
  });
});
