// Logo tạm (nhóm Logos của hệ thống thiết kế): biểu tượng vẽ bằng token (tự đổi theo chế độ sáng/tối)
// ghép với chữ HTML dùng font của trang. Logo chính thức do designer làm sau.
import { Link } from 'react-router';
import { cn } from '~/lib/utils';

/** `inverse`: đặt trên nền màu chính (khung thương hiệu của trang đăng nhập, đăng ký). */
export type LogoTone = 'default' | 'inverse';

export function LogoMark({ className, tone = 'default' }: { className?: string; tone?: LogoTone }) {
  const inverse = tone === 'inverse';
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn('size-7 shrink-0 lg:size-8', className)}
    >
      <rect
        width="32"
        height="32"
        rx="8"
        className={inverse ? 'fill-primary-foreground' : 'fill-primary'}
      />
      <path
        d="M9 20C12 10 20 9 23 13"
        className={cn('fill-none', inverse ? 'stroke-primary' : 'stroke-primary-foreground')}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle
        cx="9"
        cy="20"
        r="3.2"
        className={inverse ? 'fill-primary' : 'fill-primary-foreground'}
      />
      <circle cx="23" cy="13" r="3.2" className="fill-brand-accent" />
    </svg>
  );
}

interface LogoProps {
  to: string;
  /** Chữ cạnh biểu tượng; mặc định tên sản phẩm, khu quản trị ghi "Quản trị" / "Admin". */
  label?: string;
  tone?: LogoTone;
  className?: string;
  /** Lớp cho phần chữ, ví dụ ẩn chữ (vẫn đọc được bằng trình đọc màn hình) khi thanh trên chật. */
  labelClassName?: string;
}

export function Logo({
  to,
  label = 'TPS-Connection',
  tone = 'default',
  className,
  labelClassName,
}: LogoProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-control-md shrink-0 items-center gap-2 whitespace-nowrap rounded-md text-lg font-bold no-underline lg:gap-2.5',
        tone === 'inverse' ? 'text-primary-foreground' : 'text-foreground',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
    >
      <LogoMark tone={tone} />
      <span className={labelClassName}>{label}</span>
    </Link>
  );
}
