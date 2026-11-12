// Button theo hệ thống thiết kế (components/Button): mỗi màn hình tối đa một nút `primary`;
// chữ trên nút là động từ nói rõ việc sẽ xảy ra. Dùng <button> cho hành động; cho điều hướng,
// gắn `buttonVariants(...)` vào <Link>.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

const buttonVariantsBase = cva(
  [
    'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md border border-transparent font-semibold leading-none no-underline',
    'transition-colors motion-reduce:transition-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45',
    '[&_svg]:size-5 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:not-disabled:bg-primary-hover',
        secondary:
          'border-border-strong bg-surface text-foreground hover:not-disabled:bg-surface-sunken',
        ghost:
          'bg-transparent text-primary hover:not-disabled:bg-primary-subtle hover:not-disabled:text-primary-subtle-foreground',
        danger: 'bg-danger-solid text-danger-solid-foreground',
      },
      size: {
        md: 'min-h-control-md px-5 text-body',
        lg: 'min-h-control-lg px-6 text-base',
        icon: 'size-control-md p-0',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

/**
 * Class của biến thể, đã qua cn() (tailwind-merge) để class của biến thể thắng class gốc khi xung đột
 * (ví dụ border-transparent của gốc và border-border-strong của secondary). Dùng được trực tiếp cho <Link>.
 */
export const buttonVariants = (...args: Parameters<typeof buttonVariantsBase>) =>
  cn(buttonVariantsBase(...args));

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariantsBase>;

export function Button({
  className,
  variant,
  size,
  block,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}
