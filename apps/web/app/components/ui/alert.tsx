// Alert theo hệ thống thiết kế (components/Alert): tiêu đề ngắn + một câu giải thích + (nếu có)
// một hành động; đặt ngay trên nội dung liên quan; không tự biến mất. Thông báo tạm sau thao tác
// (Đã lưu, Đã gửi) dùng toast, không dùng Alert.
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '~/lib/utils';

const alertVariantsBase = cva('flex items-start gap-3 rounded-md px-4 py-3 text-sm/[22px]', {
  variants: {
    variant: {
      info: 'bg-primary-subtle text-primary-subtle-foreground',
      success: 'bg-success-subtle text-success',
      warning: 'bg-warning-subtle text-warning',
      danger: 'bg-danger-subtle text-danger',
    },
  },
  defaultVariants: { variant: 'info' },
});

/** Class của biến thể, đã qua cn() (tailwind-merge). */
export const alertVariants = (...args: Parameters<typeof alertVariantsBase>) =>
  cn(alertVariantsBase(...args));

type AlertVariant = NonNullable<VariantProps<typeof alertVariantsBase>['variant']>;

const ICONS: Record<AlertVariant, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export type AlertProps = Omit<ComponentProps<'div'>, 'title'> &
  VariantProps<typeof alertVariantsBase> & {
    title?: ReactNode;
  };

/**
 * Alert tĩnh không có role. Alert xuất hiện sau một thao tác (kết quả kiểm tra, lỗi tải) truyền
 * `role="status"` (hoặc `role="alert"` với lỗi) để trình đọc màn hình đọc lên.
 */
export function Alert({ className, variant, title, children, ...props }: AlertProps) {
  const Icon = ICONS[variant ?? 'info'];
  return (
    <div className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon aria-hidden="true" className="mt-px size-5 shrink-0" />
      <div className="min-w-0">
        {title && <strong className="block font-semibold">{title}</strong>}
        {children}
      </div>
    </div>
  );
}
