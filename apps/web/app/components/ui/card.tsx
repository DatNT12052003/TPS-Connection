// Card theo hệ thống thiết kế (components/Card): mỗi thẻ một tiêu đề và tối đa một nút chính;
// không lồng thẻ; không dùng viền màu một bên. `attention` cho khối cần xử lý ngay.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

const cardVariantsBase = cva(
  'flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-5',
  {
    variants: {
      variant: {
        default: '',
        attention: 'border-warning',
        interactive: [
          'cursor-pointer text-inherit no-underline transition-[box-shadow,border-color] motion-reduce:transition-none',
          'hover:border-border-strong hover:shadow-sm',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        ],
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/**
 * Class của biến thể, đã qua cn() (tailwind-merge) để class của biến thể thắng class gốc khi xung đột
 * (ví dụ border-transparent của gốc và border-border-strong của secondary). Dùng được trực tiếp cho <Link>.
 */
export const cardVariants = (...args: Parameters<typeof cardVariantsBase>) =>
  cn(cardVariantsBase(...args));

export type CardProps = ComponentProps<'section'> & VariantProps<typeof cardVariantsBase>;

export function Card({ className, variant, ...props }: CardProps) {
  return <section className={cn(cardVariants({ variant }), className)} {...props} />;
}

/** Hàng tiêu đề của thẻ: tiêu đề bên trái, hành động phụ bên phải, tự xuống dòng khi hẹp. */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2', className)}
      {...props}
    />
  );
}
