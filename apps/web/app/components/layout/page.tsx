import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

/** Vùng nội dung chính: rộng tối đa 1280 px; lề 16 px (điện thoại), 24 px (máy tính bảng), 32 px (máy tính). */
export function PageContainer({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-page flex-col gap-4 p-4 md:gap-6 md:p-6 lg:p-8',
        className,
      )}
      {...props}
    />
  );
}

/** Liên kết "Bỏ qua, đến nội dung chính": chỉ hiện khi dùng bàn phím (Tab). */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      {label}
    </a>
  );
}
