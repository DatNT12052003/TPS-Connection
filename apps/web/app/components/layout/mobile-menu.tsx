import { Menu, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

/**
 * Menu mở ra trên màn hình hẹp, dựng bằng <details>: mở/đóng được cả khi JavaScript chưa tải xong.
 * Tự đóng khi chuyển trang.
 */
export function MobileMenu({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [location.pathname]);

  return (
    <details ref={ref} className={cn('group', className)}>
      <summary
        aria-label={t('layout.openMenu')}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'list-none text-foreground [&::-webkit-details-marker]:hidden',
        )}
      >
        <Menu aria-hidden="true" className="group-open:hidden" />
        <X aria-hidden="true" className="hidden group-open:block" />
      </summary>
      <div className="absolute inset-x-0 top-full z-30 border-b border-border bg-surface-raised p-4 shadow-md">
        {children}
      </div>
    </details>
  );
}
