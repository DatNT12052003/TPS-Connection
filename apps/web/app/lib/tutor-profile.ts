// Form sửa hồ sơ gia sư: giá trị form <-> body PUT /me/tutor-profile, học phí, khung giờ. Dùng được cả ở server
// (action) và trình duyệt (các ô danh sách). Các danh sách (môn × khối, khu vực, lịch rảnh) do component trên
// trình duyệt quản lý và gửi trong ô ẩn dạng JSON.
import type { AvailabilitySlot, OwnTutorProfile, TeachingSubject } from '@tps/shared';
import { type ApiError } from './api';
import type { CatalogOption } from './catalog';
import { formText, type Message } from './form';
import { isValidationCode } from '@tps/shared';

/** Ô văn bản một dòng / nhiều dòng của hồ sơ (gửi nguyên văn, API tự cắt khoảng trắng). */
export const TUTOR_TEXT_FIELDS = [
  'headline',
  'bio',
  'institution',
  'major',
  'highestEducation',
  'teachingMethod',
  'achievements',
  'introVideoUrl',
] as const;

/** Các ô của form; `fullName` lưu qua PATCH /me (cùng nút Lưu). */
export const TUTOR_FORM_FIELDS = [
  ...TUTOR_TEXT_FIELDS,
  'fullName',
  'occupation',
  'experienceYears',
  'teachingMode',
  'rateAmount',
  'rateUnit',
  'acceptingStudents',
  'teachingSubjects',
  'serviceAreaIds',
  'availability',
] as const;
export type TutorFormField = (typeof TUTOR_FORM_FIELDS)[number];
export type TutorFormValues = Record<TutorFormField, string>;

/** Ô của form ứng với đường dẫn lỗi của API (`rate.amountVnd` → ô số tiền, `availability.2.endTime` → lịch). */
function formFieldOf(path: string): TutorFormField | undefined {
  const [head, second] = path.split('.');
  if (head === 'rate') return second === 'unit' ? 'rateUnit' : 'rateAmount';
  return TUTOR_FORM_FIELDS.find((field) => field === head);
}

/** Lỗi theo ô của API (hồ sơ hoặc PATCH /me) cho form gia sư: lỗi đầu tiên của mỗi ô. */
export function tutorFieldErrors(error: ApiError): Partial<Record<TutorFormField, Message>> {
  const result: Partial<Record<TutorFormField, Message>> = {};
  for (const detail of error.details) {
    const field = formFieldOf(detail.path);
    if (!field || result[field]) continue;
    const code = isValidationCode(detail.code) ? detail.code : 'invalid';
    result[field] = { key: `validation.${code}` };
  }
  return result;
}

/** "180.000", "180000đ", "180 000" → 180000. Trống: null. Không có chữ số: NaN (API báo lỗi). */
export function parseMoney(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, '');
  return digits ? Number(digits) : Number.NaN;
}

/** 180000 → "180.000" (vi) / "180,000" (en). */
export function formatMoney(amount: number, language: string): string {
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'vi-VN').format(amount);
}

function parseJsonList<T>(text: string): T[] {
  try {
    const value: unknown = JSON.parse(text || '[]');
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export const parseTeachingSubjects = (text: string) => parseJsonList<TeachingSubject>(text);
export const parseServiceAreaIds = (text: string) => parseJsonList<number>(text);
export const parseAvailability = (text: string) => parseJsonList<AvailabilitySlot>(text);

export function tutorValuesFrom(form: FormData): TutorFormValues {
  const values = Object.fromEntries(
    TUTOR_FORM_FIELDS.map((field) => [field, formText(form, field)]),
  ) as TutorFormValues;
  // Ô đánh dấu: không đánh dấu thì trình duyệt không gửi gì.
  values.acceptingStudents = form.get('acceptingStudents') === 'on' ? 'on' : '';
  return values;
}

/** Body PUT /me/tutor-profile (thay toàn bộ hồ sơ). */
export function tutorBody(values: TutorFormValues) {
  const amount = parseMoney(values.rateAmount);
  const years = values.experienceYears.trim();
  return {
    ...Object.fromEntries(TUTOR_TEXT_FIELDS.map((field) => [field, values[field]])),
    occupation: values.occupation || null,
    experienceYears: years === '' ? null : Number(years),
    teachingMode: values.teachingMode || null,
    // Chưa nhập số tiền: chưa có học phí (đơn vị bỏ qua).
    rate: amount === null ? null : { amountVnd: amount, unit: values.rateUnit || 'session' },
    acceptingStudents: values.acceptingStudents === 'on',
    teachingSubjects: parseTeachingSubjects(values.teachingSubjects),
    // Dạy trực tuyến thì không có khu vực dạy trực tiếp.
    serviceAreaIds:
      values.teachingMode === 'online' ? [] : parseServiceAreaIds(values.serviceAreaIds),
    availability: parseAvailability(values.availability),
  };
}

/** Giá trị ban đầu của form từ hồ sơ đã lưu. */
export function tutorFormValues(
  profile: OwnTutorProfile,
  fullName: string | null,
  language: string,
): TutorFormValues {
  const text = (value: string | number | null) => (value === null ? '' : String(value));
  return {
    ...(Object.fromEntries(
      TUTOR_TEXT_FIELDS.map((field) => [field, text(profile[field])]),
    ) as Record<(typeof TUTOR_TEXT_FIELDS)[number], string>),
    fullName: text(fullName),
    occupation: text(profile.occupation),
    experienceYears: text(profile.experienceYears),
    teachingMode: text(profile.teachingMode),
    rateAmount: profile.rate ? formatMoney(profile.rate.amountVnd, language) : '',
    rateUnit: profile.rate?.unit ?? 'session',
    acceptingStudents: profile.acceptingStudents ? 'on' : '',
    teachingSubjects: JSON.stringify(profile.teachingSubjects),
    serviceAreaIds: JSON.stringify(profile.serviceAreaIds),
    availability: JSON.stringify(profile.availability),
  };
}

// ---- Môn × khối -----------------------------------------------------------------------------------

/** Cặp môn × khối gộp theo môn, giữ thứ tự môn xuất hiện đầu tiên. */
export function groupBySubject(pairs: readonly TeachingSubject[]): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (const { subjectId, gradeLevelId } of pairs) {
    groups.set(subjectId, [...(groups.get(subjectId) ?? []), gradeLevelId]);
  }
  return groups;
}

/**
 * Các khối của một môn, dạng ngắn theo thứ tự danh mục: khối liền nhau gộp thành khoảng
 * ("Lớp 6 – Lớp 9, Đại học").
 */
export function summarizeGrades(
  gradeIds: readonly number[],
  grades: readonly CatalogOption[],
): string {
  const chosen = new Set(gradeIds);
  const runs: CatalogOption[][] = [];
  let run: CatalogOption[] = [];
  for (const grade of grades) {
    if (chosen.has(grade.id)) {
      run.push(grade);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs
    .map((r) =>
      r.length >= 3
        ? `${r[0]!.label} – ${r[r.length - 1]!.label}`
        : r.map((g) => g.label).join(', '),
    )
    .join(', ');
}

// ---- Lịch rảnh ------------------------------------------------------------------------------------

/** Giờ chọn được cho khung giờ rảnh: 06:00 … 23:00, cách nhau 30 phút. */
export const TIME_OPTIONS: string[] = Array.from({ length: 35 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

/** Khung giờ mặc định khi thêm mới (buổi tối, giờ học thêm phổ biến). */
export const DEFAULT_SLOT = { startTime: '18:00', endTime: '20:00' } as const;

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Body PUT từ hồ sơ đã lưu (đổi một trường mà giữ nguyên phần còn lại, ví dụ công tắc nhận học sinh). */
export function profileBody(profile: OwnTutorProfile) {
  return {
    ...Object.fromEntries(TUTOR_TEXT_FIELDS.map((field) => [field, profile[field]])),
    occupation: profile.occupation,
    experienceYears: profile.experienceYears,
    teachingMode: profile.teachingMode,
    rate: profile.rate,
    acceptingStudents: profile.acceptingStudents,
    teachingSubjects: profile.teachingSubjects,
    serviceAreaIds: profile.serviceAreaIds,
    availability: profile.availability,
  };
}
