// Ô ngày: gõ trực tiếp `dd/mm/yyyy` hoặc bấm icon lịch để chọn (react-day-picker trong Popover, có ô chọn
// tháng và năm để lùi nhanh nhiều năm, ví dụ ngày sinh). Ô gửi đi chính chữ đang hiện; action đổi sang
// `YYYY-MM-DD` bằng `displayToIso` (lib/dates.ts), nên form vẫn gửi được khi chưa tải JavaScript.
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { type ChevronProps, DayPicker } from 'react-day-picker';
import { enGB, vi } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';
import { dateToIso, displayToIso, isoToDate, isoToDisplay } from '~/lib/dates';
import { cn } from '~/lib/utils';
import { FieldFrame, type FieldFrameProps, inputClassName } from './field';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';

export type DateFieldProps = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'min' | 'max' | 'children'
> &
  FieldFrameProps & {
    /** Giá trị ban đầu dạng `dd/mm/yyyy` (hoặc chữ người dùng đã gõ, khi hiện lại form có lỗi). */
    defaultValue?: string;
    /** Ngày sớm nhất / muộn nhất được chọn, `YYYY-MM-DD`. */
    min: string;
    max: string;
    /** Tháng lịch mở ra khi ô còn trống, `YYYY-MM-DD` (mặc định: tháng của `max`). */
    initialMonth?: string;
  };

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon =
    orientation === 'left' ? ChevronLeft : orientation === 'right' ? ChevronRight : ChevronDown;
  return <Icon aria-hidden className={cn('size-4.5', className)} />;
}

const dayButton = cn(
  'flex size-10 items-center justify-center rounded-md text-body text-foreground',
  'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-ring',
);

export function DateField({
  id,
  label,
  hint,
  error,
  labelAside,
  className,
  defaultValue = '',
  min,
  max,
  initialMonth,
  onChange,
  ...props
}: DateFieldProps) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const selectedIso = displayToIso(text);
  const selected = selectedIso ? isoToDate(selectedIso) : undefined;
  const firstDay = isoToDate(min);
  const lastDay = isoToDate(max);

  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      labelAside={labelAside}
      className={className}
      control={(aria) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="relative">
              <input
                {...aria}
                type="text"
                autoComplete="off"
                placeholder={t('dateField.placeholder')}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  onChange?.(event);
                }}
                className={cn(inputClassName, 'pr-12')}
                {...props}
              />
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t('dateField.openCalendar')}
                  disabled={props.disabled}
                  className={cn(
                    'absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground',
                    'hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    'disabled:cursor-not-allowed',
                  )}
                >
                  <CalendarDays aria-hidden className="size-5" />
                </button>
              </PopoverTrigger>
            </div>
          </PopoverAnchor>
          <PopoverContent align="end" aria-label={t('dateField.calendar')}>
            <DayPicker
              mode="single"
              autoFocus
              locale={i18n.language === 'en' ? enGB : vi}
              selected={selected}
              onSelect={(date) => {
                if (date) setText(isoToDisplay(dateToIso(date)));
                setOpen(false);
              }}
              defaultMonth={selected ?? (initialMonth ? isoToDate(initialMonth) : lastDay)}
              captionLayout="dropdown"
              // Hiện ngày của tháng trước/sau (mờ): hàng đầu luôn đủ 7 ô, dễ thấy thứ của ngày 1.
              showOutsideDays
              fixedWeeks
              startMonth={firstDay}
              endMonth={lastDay}
              disabled={[{ before: firstDay }, { after: lastDay }]}
              components={{ Chevron: CalendarChevron }}
              classNames={{
                root: 'relative w-fit',
                months: 'relative flex flex-col',
                month: 'flex flex-col gap-3',
                nav: 'absolute inset-x-0 top-0 flex h-10 items-center justify-between',
                button_previous: cn(
                  'flex size-10 items-center justify-center rounded-md text-foreground',
                  'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-ring',
                  'disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-50',
                ),
                button_next: cn(
                  'flex size-10 items-center justify-center rounded-md text-foreground',
                  'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-ring',
                  'disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-50',
                ),
                month_caption: 'flex h-10 items-center justify-center px-10',
                dropdowns: 'flex items-center gap-1.5',
                dropdown_root: cn(
                  'relative rounded-md border border-border-strong bg-surface',
                  'has-focus-visible:border-ring has-focus-visible:ring-1 has-focus-visible:ring-ring',
                ),
                dropdown: 'absolute inset-0 cursor-pointer opacity-0',
                caption_label:
                  'flex h-9 items-center gap-1 rounded-md pr-1.5 pl-2.5 text-label text-foreground [&>svg]:text-muted-foreground',
                month_grid: 'border-collapse',
                weekdays: 'flex',
                weekday:
                  'flex size-10 items-center justify-center text-small text-muted-foreground',
                week: 'mt-0.5 flex',
                // Ô ngày rộng cố định (cả ô trống): nếu không, ô không có nút co về 0 và ngày lệch thứ.
                day: 'size-10 shrink-0 p-0',
                day_button: dayButton,
                today: '[&>button]:font-semibold [&>button]:text-primary',
                selected:
                  '[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover',
                outside: '[&>button]:text-muted-foreground [&>button]:opacity-60',
                disabled:
                  '[&>button]:pointer-events-none [&>button]:text-muted-foreground [&>button]:opacity-40',
                hidden: 'invisible',
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    />
  );
}
