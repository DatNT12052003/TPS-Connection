// Lịch rảnh trong tuần (canvas TutorProfileEdit, "Lịch rảnh"): mỗi ngày một hàng, mỗi khung giờ là hai ô chọn
// giờ bắt đầu – kết thúc (30 phút một nấc), thêm/bỏ khung giờ theo ngày. Gửi trong ô ẩn `availability`
// dạng JSON [{ weekday, startTime, endTime }]; API kiểm tra giờ kết thúc sau giờ bắt đầu và không chồng nhau.
import type { AvailabilitySlot } from '@tps/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { DEFAULT_SLOT, TIME_OPTIONS, WEEKDAYS } from '~/lib/tutor-profile';
import { cn } from '~/lib/utils';

interface Slot extends AvailabilitySlot {
  /** Khóa ổn định cho React (khung giờ mới chưa có id). */
  key: number;
}

const timeSelect = cn(
  'min-h-10 rounded-md border border-border-strong bg-surface px-2 text-body text-foreground',
  'focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
);

export function AvailabilityEditor({
  initial,
  error,
}: {
  initial: readonly AvailabilitySlot[];
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<Slot[]>(() => initial.map((slot, key) => ({ ...slot, key })));
  const [nextKey, setNextKey] = useState(initial.length);

  const value: AvailabilitySlot[] = slots.map(({ weekday, startTime, endTime }) => ({
    weekday,
    startTime,
    endTime,
  }));

  function update(key: number, change: Partial<AvailabilitySlot>) {
    setSlots((current) => current.map((s) => (s.key === key ? { ...s, ...change } : s)));
  }

  function add(weekday: number) {
    setSlots((current) => [...current, { weekday, ...DEFAULT_SLOT, key: nextKey }]);
    setNextKey((k) => k + 1);
  }

  // Giờ đã lưu có thể lệch nấc 30 phút (nhập từ nơi khác): vẫn hiện trong danh sách chọn.
  const optionsWith = (time: string) =>
    TIME_OPTIONS.includes(time) ? TIME_OPTIONS : [...TIME_OPTIONS, time].sort();

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name="availability" value={JSON.stringify(value)} />
      {error && <span className="pb-2 text-small font-medium text-danger">{error}</span>}
      <ul className="flex flex-col divide-y divide-border">
        {WEEKDAYS.map((weekday) => {
          const day = t(`weekday.${weekday}`);
          const daySlots = slots
            .filter((s) => s.weekday === weekday)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <li
              key={weekday}
              className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-3 py-3"
            >
              <span className="pt-2 font-semibold">{day}</span>
              <div className="flex flex-wrap items-center gap-2">
                {daySlots.map((slot) => (
                  <div
                    key={slot.key}
                    role="group"
                    aria-label={t('tutorProfile.slotOf', { day })}
                    className="inline-flex items-center gap-1.5 rounded-md bg-surface-sunken py-1 pr-1 pl-2"
                  >
                    <select
                      aria-label={t('tutorProfile.slotStart')}
                      value={slot.startTime}
                      onChange={(event) => update(slot.key, { startTime: event.target.value })}
                      className={timeSelect}
                    >
                      {optionsWith(slot.startTime).map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden="true">–</span>
                    <select
                      aria-label={t('tutorProfile.slotEnd')}
                      value={slot.endTime}
                      onChange={(event) => update(slot.key, { endTime: event.target.value })}
                      className={timeSelect}
                    >
                      {optionsWith(slot.endTime).map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('tutorProfile.removeSlot', {
                        day,
                        start: slot.startTime,
                        end: slot.endTime,
                      })}
                      onClick={() =>
                        setSlots((current) => current.filter((s) => s.key !== slot.key))
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t('tutorProfile.addSlotTo', { day })}
                  onClick={() => add(weekday)}
                >
                  <Plus aria-hidden="true" />
                  {daySlots.length === 0 ? t('tutorProfile.addSlot') : t('tutorProfile.addAnother')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
