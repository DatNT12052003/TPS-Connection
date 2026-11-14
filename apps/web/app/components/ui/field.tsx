// Ô nhập theo hệ thống thiết kế (components/TextField): nhãn luôn hiện phía trên, gợi ý và lỗi ngay dưới ô,
// lỗi nói rõ sai gì và sửa thế nào. Lỗi được nối với ô bằng aria-describedby và aria-invalid.
// Ô đánh dấu và thẻ lựa chọn (radio dạng thẻ) theo canvas giao diện (.check, .choice).
import { ChevronDown } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId } from 'react';
import { cn } from '~/lib/utils';

export const inputClassName = cn(
  'w-full min-h-control-md rounded-md border border-border-strong bg-surface px-3 text-body text-foreground',
  'placeholder:text-muted-foreground',
  // Focus (D58): viền đổi màu + vòng 1 px sát ngoài viền = một nét liền 2 px (không dùng outline-offset: khe hở
  // giữa viền và outline trông như hai đường tách nhau).
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted-foreground',
  'aria-invalid:border-danger',
);

export interface FieldFrameProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Thông điệp lỗi đã dịch; có lỗi thì ô được đánh dấu aria-invalid. */
  error?: string | undefined;
  /** Nội dung cùng hàng với nhãn, bên phải (ví dụ liên kết "Quên mật khẩu?"). */
  labelAside?: ReactNode;
}

/** Khung chung của ô nhập, ô chọn, ô nhiều dòng: nhãn trên, lỗi rồi gợi ý dưới, nối bằng aria. */
export function FieldFrame({
  id,
  label,
  hint,
  error,
  labelAside,
  className,
  control,
}: FieldFrameProps & {
  id: string | undefined;
  className: string | undefined;
  control: (aria: {
    id: string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <label htmlFor={inputId} className="text-label text-foreground">
          {label}
        </label>
        {labelAside}
      </div>
      {control({
        id: inputId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {error && (
        <span id={errorId} className="text-small font-medium text-danger">
          {error}
        </span>
      )}
      {hint && (
        <span id={hintId} className="text-small text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}

export type TextFieldProps = Omit<ComponentProps<'input'>, 'children'> &
  FieldFrameProps & {
    /** Class thêm cho chính ô nhập (ví dụ ô mã 6 số chữ lớn). */
    inputClassName?: string;
  };

export function TextField({
  id,
  label,
  hint,
  error,
  labelAside,
  className,
  inputClassName: extraInputClassName,
  ...props
}: TextFieldProps) {
  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      labelAside={labelAside}
      className={className}
      control={(aria) => (
        <input {...aria} className={cn(inputClassName, extraInputClassName)} {...props} />
      )}
    />
  );
}

export type SelectFieldProps = ComponentProps<'select'> & FieldFrameProps;

/**
 * Ô chọn một giá trị (select gốc của trình duyệt: dùng tốt trên điện thoại và bằng bàn phím). Mũi tên gốc của
 * trình duyệt bị ẩn (mỗi trình duyệt đặt sát lề một kiểu) và thay bằng icon cách lề phải 12 px.
 */
export function SelectField({
  id,
  label,
  hint,
  error,
  labelAside,
  className,
  children,
  ...props
}: SelectFieldProps) {
  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      labelAside={labelAside}
      className={className}
      control={(aria) => (
        <div className="relative">
          <select {...aria} className={cn(inputClassName, 'appearance-none pr-10')} {...props}>
            {children}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 size-4.5 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      )}
    />
  );
}

export type TextAreaFieldProps = Omit<ComponentProps<'textarea'>, 'children'> & FieldFrameProps;

/** Ô nhập nhiều dòng (ghi chú, mô tả). */
export function TextAreaField({
  id,
  label,
  hint,
  error,
  labelAside,
  className,
  rows = 4,
  ...props
}: TextAreaFieldProps) {
  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      labelAside={labelAside}
      className={className}
      control={(aria) => (
        <textarea
          {...aria}
          rows={rows}
          className={cn(inputClassName, 'min-h-24 py-2.5')}
          {...props}
        />
      )}
    />
  );
}

export type CheckboxFieldProps = Omit<ComponentProps<'input'>, 'type' | 'children'> & {
  children: ReactNode;
  error?: string | undefined;
};

/** Ô đánh dấu có nhãn bên phải (đồng ý điều khoản, ghi nhớ đăng nhập). */
export function CheckboxField({ id, children, error, className, ...props }: CheckboxFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={inputId}
        className="flex min-h-control-md cursor-pointer items-start gap-3 pt-2.5"
      >
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.75 size-4.5 shrink-0 accent-primary"
          {...props}
        />
        <span className="text-small text-foreground">{children}</span>
      </label>
      {error && (
        <span id={errorId} className="text-small font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

export type ChoiceCardProps = Omit<ComponentProps<'input'>, 'type' | 'children'> & {
  title: ReactNode;
  description?: ReactNode;
};

/**
 * Lựa chọn dạng thẻ (radio). Thẻ đang chọn đổi viền và nền theo `:has(:checked)`, nên đúng cả khi chưa
 * tải JavaScript.
 */
export function ChoiceCard({ title, description, className, ...props }: ChoiceCardProps) {
  return (
    <label
      className={cn(
        'flex min-h-control-md cursor-pointer items-center gap-3 rounded-md border border-border-strong bg-surface px-4 py-3',
        'has-checked:border-primary has-checked:bg-primary-subtle has-checked:ring-1 has-checked:ring-primary has-checked:ring-inset',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
        className,
      )}
    >
      <input type="radio" className="size-4.5 shrink-0 accent-primary" {...props} />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-foreground">{title}</span>
        {description && <span className="text-small text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}
