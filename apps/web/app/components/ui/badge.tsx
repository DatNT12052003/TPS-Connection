// Badge theo hệ thống thiết kế (components/Badge): luôn có chữ (lấy từ i18n theo giá trị trạng thái
// trong @tps/shared), màu chỉ là tín hiệu phụ. `self` (tự khai) và `verified` (đã xác minh) là hai
// nhãn khác nhau, không dùng lẫn. Không dùng màu cam cho trạng thái.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

const badgeVariantsBase = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-small font-semibold [&_svg]:size-4',
  {
    variants: {
      variant: {
        verified: 'bg-primary-subtle text-primary-subtle-foreground',
        self: 'bg-transparent text-muted-foreground inset-ring inset-ring-border-strong',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger',
        neutral: 'bg-surface-sunken text-muted-foreground',
        new: 'bg-brand-accent-subtle text-brand-accent-subtle-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

/**
 * Class của biến thể, đã qua cn() (tailwind-merge) để class của biến thể thắng class gốc khi xung đột
 * (ví dụ border-transparent của gốc và border-border-strong của secondary). Dùng được trực tiếp cho <Link>.
 */
export const badgeVariants = (...args: Parameters<typeof badgeVariantsBase>) =>
  cn(badgeVariantsBase(...args));

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariantsBase> & {
    /** Chấm tròn trước chữ, giúp quét nhanh trong bảng dày. */
    dot?: boolean;
  };

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
