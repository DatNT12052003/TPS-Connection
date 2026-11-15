import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import type { NavItem } from '~/lib/navigation';
import { cn } from '~/lib/utils';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Số cột của thanh dưới đáy theo số mục (tối đa 5, xem MOBILE_NAV_MAX). */
const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

/** Thanh điều hướng ngang (máy tính). NavLink tự đặt aria-current="page" cho mục đang mở. */
export function TopNav({ items, label }: { items: NavItem[]; label: string }) {
  const { t } = useTranslation();
  return (
    // Luôn một hàng: 1024–1279 px thu gọn khoảng đệm, từ 1280 px giãn ra (header cũng gọn lại tương ứng).
    <nav aria-label={label} className="flex items-center gap-0.5 xl:gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end ?? false}
          className={cn(
            'inline-flex min-h-control-md items-center whitespace-nowrap rounded-md px-2.5 font-semibold text-muted-foreground no-underline xl:px-3',
            'hover:bg-surface-sunken hover:text-foreground',
            'aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-subtle-foreground',
            focusRing,
          )}
        >
          {t(item.label)}
        </NavLink>
      ))}
    </nav>
  );
}

/** Thanh điều hướng dưới đáy (điện thoại, máy tính bảng dọc): icon + nhãn ngắn, tối đa 5 mục. */
export function BottomNav({ items, label }: { items: NavItem[]; label: string }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className={cn('mx-auto grid max-w-page px-1 pt-1 pb-2.5', GRID_COLS[items.length])}>
        {items.map(({ to, label: key, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end ?? false}
              className={cn(
                'flex min-h-control-lg flex-col items-center justify-center gap-0.5 rounded-md px-1',
                'text-center text-xs font-semibold text-muted-foreground no-underline',
                'aria-[current=page]:text-primary',
                focusRing,
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
              {t(key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Danh sách dọc trong menu mở ra (điện thoại): khu công khai và khu quản trị. */
export function MenuNav({ items, label }: { items: NavItem[]; label: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1">
        {items.map(({ to, label: key, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end ?? false}
              className={cn(
                'flex min-h-control-md items-center gap-3 rounded-md px-3 font-semibold text-foreground no-underline',
                'hover:bg-surface-sunken',
                'aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-subtle-foreground',
                focusRing,
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
              {t(key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
