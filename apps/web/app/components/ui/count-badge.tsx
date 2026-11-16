// Số đếm nhỏ (chưa đọc) gắn ở góc một biểu tượng hoặc cạnh nhãn điều hướng. Trên 99 hiện "99+". Số chỉ là tín hiệu
// phụ: nhãn đọc được (`label`) nằm trong `sr-only` để trình đọc màn hình đọc đúng ý nghĩa.
import { cn } from '~/lib/utils';

export function CountBadge({
  count,
  label,
  className,
}: {
  count: number;
  /** Ví dụ "3 thông báo chưa đọc". */
  label: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-danger-solid px-1.5 text-xs leading-5 font-bold text-danger-solid-foreground',
        className,
      )}
    >
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
