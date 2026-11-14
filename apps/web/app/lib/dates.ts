// Ngày dạng chữ trên form: người dùng gõ / thấy `dd/mm/yyyy` (cả tiếng Việt và tiếng Anh, theo en-GB), API
// nhận `YYYY-MM-DD`. Chỉ là ngày lịch, không có giờ, nên không đổi múi giờ.

const DISPLAY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, '0');

/** Ngày có thật không (loại 31/02, 30/02…). */
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** `dd/mm/yyyy` (chấp nhận cả `.` và `-`, ngày/tháng một chữ số) sang `YYYY-MM-DD`; sai thì null. */
export function displayToIso(text: string): string | null {
  const match = DISPLAY.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
}

/** `YYYY-MM-DD` sang `dd/mm/yyyy`; không đúng dạng thì trả nguyên văn. */
export function isoToDisplay(iso: string): string {
  const match = ISO.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** `YYYY-MM-DD` sang Date lúc 0 giờ theo giờ máy (cho lịch chọn ngày). */
export function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

/** Date sang `YYYY-MM-DD` theo giờ máy. */
export function dateToIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Hôm nay theo giờ máy, `YYYY-MM-DD`. */
export const todayIso = () => dateToIso(new Date());
