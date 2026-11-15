// Nút bánh răng trên thanh trên: mở bảng chọn ngôn ngữ và chế độ màu. Dựng bằng <details> nên mở/đóng
// được cả khi JavaScript chưa tải; có JavaScript thì đóng khi bấm ra ngoài, nhấn Esc, chuyển trang
// hoặc vừa chọn xong.
import { Settings } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { PreferencesControls } from './preferences-controls';

export function SettingsMenu({ className }: { className?: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [location.pathname, location.search]);

  useEffect(() => {
    const close = () => {
      if (ref.current) ref.current.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        close();
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={cn('relative', className)}>
      <summary
        aria-label={t('preferences.title')}
        title={t('preferences.title')}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'list-none text-foreground [&::-webkit-details-marker]:hidden',
        )}
      >
        <Settings aria-hidden="true" />
      </summary>
      {/* Dưới 640 px: bảng trải ngang màn hình (nút có thể không nằm sát mép phải), tránh tràn ra ngoài. */}
      <div className="z-40 rounded-lg border border-border bg-surface-raised p-4 shadow-md max-sm:fixed max-sm:inset-x-4 max-sm:top-16 sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:w-max">
        <PreferencesControls
          layout="stacked"
          onSubmit={() => {
            if (ref.current) ref.current.open = false;
          }}
        />
      </div>
    </details>
  );
}
