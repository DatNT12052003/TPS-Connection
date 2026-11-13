// Logo tạm (nhóm Logos của hệ thống thiết kế): biểu tượng vẽ bằng token (tự đổi theo chế độ sáng/tối)
// ghép với chữ HTML dùng font của trang. Logo chính thức do designer làm sau.
import { Link } from 'react-router';
import { cn } from '~/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M9 20C12 10 20 9 23 13"
        className="fill-none stroke-primary-foreground"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="9" cy="20" r="3.2" className="fill-primary-foreground" />
      <circle cx="23" cy="13" r="3.2" className="fill-brand-accent" />
    </svg>
  );
}

interface LogoProps {
  to: string;
  /** Chữ cạnh biểu tượng; mặc định tên sản phẩm, khu quản trị ghi "Quản trị" / "Admin". */
  label?: string;
  className?: string;
}

export function Logo({ to, label = 'TPS-Connection', className }: LogoProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-control-md items-center gap-2.5 whitespace-nowrap rounded-md text-lg font-bold text-foreground no-underline',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
    >
      <LogoMark />
      {label}
    </Link>
  );
}
