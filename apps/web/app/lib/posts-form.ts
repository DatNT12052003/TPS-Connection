// Form bài tuyển học sinh và bài tìm gia sư (G4): giá trị form <-> body API, lỗi theo ô. Dùng được cả ở server
// (action) và trình duyệt. Các danh sách (môn × khối, khu vực, lịch) do component trên trình duyệt quản lý và gửi
// trong ô ẩn dạng JSON, như form hồ sơ gia sư.
import { isValidationCode, type OwnRequestPost, type OwnTutorPost } from '@tps/shared';
import type { ApiError } from './api';
import { displayToIso, isoToDisplay } from './dates';
import { formText, type Message } from './form';
import {
  formatMoney,
  parseAvailability,
  parseMoney,
  parseServiceAreaIds,
  parseTeachingSubjects,
} from './tutor-profile';

type Errors<F extends string> = Partial<Record<F, Message>>;

function valuesFrom<F extends string>(form: FormData, fields: readonly F[]): Record<F, string> {
  return Object.fromEntries(fields.map((field) => [field, formText(form, field)])) as Record<
    F,
    string
  >;
}

/** Ngày trên form (dd/mm/yyyy) sang ISO; sai dạng thì gửi nguyên văn để API báo lỗi ở đúng ô. */
const dateBody = (text: string) => (text.trim() ? (displayToIso(text) ?? text) : null);

function errorsFrom<F extends string>(
  error: ApiError,
  fieldOf: (path: string) => F | undefined,
): Errors<F> {
  const result: Errors<F> = {};
  for (const detail of error.details) {
    const field = fieldOf(detail.path);
    if (!field || result[field]) continue;
    const code = isValidationCode(detail.code) ? detail.code : 'invalid';
    result[field] = { key: `validation.${code}` };
  }
  return result;
}

// ---- Bài tuyển học sinh ---------------------------------------------------------------------------

export const TUTOR_POST_FIELDS = [
  'title',
  'description',
  'teachingMode',
  'rateAmount',
  'rateUnit',
  'capacity',
  'availableFrom',
  'subjects',
  'areaIds',
  'slots',
] as const;
export type TutorPostField = (typeof TUTOR_POST_FIELDS)[number];
export type TutorPostValues = Record<TutorPostField, string>;

export const tutorPostValuesFrom = (form: FormData): TutorPostValues =>
  valuesFrom(form, TUTOR_POST_FIELDS);

/** Body POST/PUT /me/tutor-posts (gửi toàn bộ nội dung). */
export function tutorPostBody(values: TutorPostValues) {
  const amount = parseMoney(values.rateAmount);
  const capacity = values.capacity.trim();
  return {
    title: values.title,
    description: values.description,
    teachingMode: values.teachingMode || null,
    rate: amount === null ? null : { amountVnd: amount, unit: values.rateUnit || 'session' },
    capacity: capacity === '' ? null : Number(capacity),
    availableFrom: dateBody(values.availableFrom),
    subjects: parseTeachingSubjects(values.subjects),
    // Dạy trực tuyến thì không có khu vực dạy trực tiếp.
    areaIds: values.teachingMode === 'online' ? [] : parseServiceAreaIds(values.areaIds),
    slots: parseAvailability(values.slots),
  };
}

export function tutorPostValues(post: OwnTutorPost | null, language: string): TutorPostValues {
  return {
    title: post?.title ?? '',
    description: post?.description ?? '',
    teachingMode: post?.teachingMode ?? '',
    rateAmount: post?.rate ? formatMoney(post.rate.amountVnd, language) : '',
    rateUnit: post?.rate?.unit ?? 'session',
    capacity: post?.capacity === null || post?.capacity === undefined ? '' : String(post.capacity),
    availableFrom: post?.availableFrom ? isoToDisplay(post.availableFrom) : '',
    subjects: JSON.stringify(post?.subjects ?? []),
    areaIds: JSON.stringify(post?.areaIds ?? []),
    slots: JSON.stringify(post?.slots ?? []),
  };
}

export function tutorPostFieldErrors(error: ApiError): Errors<TutorPostField> {
  return errorsFrom(error, (path) => {
    const [head, second] = path.split('.');
    if (head === 'rate') return second === 'unit' ? 'rateUnit' : 'rateAmount';
    return TUTOR_POST_FIELDS.find((field) => field === head);
  });
}

// ---- Bài tìm gia sư -------------------------------------------------------------------------------

export const REQUEST_POST_FIELDS = [
  'learnerId',
  'subjectId',
  'gradeLevelId',
  'goal',
  'goalNote',
  'teachingMode',
  'provinceId',
  'communeId',
  'budgetMin',
  'budgetMax',
  'budgetUnit',
  'desiredStartDate',
  'tutorRequirements',
  'description',
  'slots',
] as const;
export type RequestPostField = (typeof REQUEST_POST_FIELDS)[number];
export type RequestPostValues = Record<RequestPostField, string>;

export const requestPostValuesFrom = (form: FormData): RequestPostValues =>
  valuesFrom(form, REQUEST_POST_FIELDS);

const idOrNull = (text: string) => (text.trim() === '' ? null : Number(text));

/** Body PUT /me/request-posts/:id (không có `learnerId`: hồ sơ con không đổi được sau khi tạo). */
export function requestPostBody(values: RequestPostValues) {
  const min = parseMoney(values.budgetMin);
  const max = parseMoney(values.budgetMax);
  const online = values.teachingMode === 'online';
  return {
    subjectId: idOrNull(values.subjectId),
    gradeLevelId: idOrNull(values.gradeLevelId),
    goal: values.goal || null,
    goalNote: values.goalNote,
    teachingMode: values.teachingMode || null,
    // Học trực tuyến không cần khu vực; vẫn gửi nếu phụ huynh đã chọn (API chấp nhận).
    provinceId: idOrNull(values.provinceId),
    communeId: online && !values.provinceId ? null : idOrNull(values.communeId),
    budget:
      min === null && max === null
        ? null
        : { minVnd: min, maxVnd: max, unit: values.budgetUnit || 'session' },
    desiredStartDate: dateBody(values.desiredStartDate),
    tutorRequirements: values.tutorRequirements,
    description: values.description,
    slots: parseAvailability(values.slots),
  };
}

/** Body POST /me/request-posts. */
export const createRequestPostBody = (values: RequestPostValues) => ({
  learnerId: values.learnerId,
  ...requestPostBody(values),
});

export function requestPostValues(
  post: OwnRequestPost | null,
  language: string,
  defaults: Partial<RequestPostValues> = {},
): RequestPostValues {
  const money = (n: number | null | undefined) =>
    n === null || n === undefined ? '' : formatMoney(n, language);
  const id = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
  return {
    learnerId: post?.learnerId ?? defaults.learnerId ?? '',
    subjectId: id(post?.subjectId) || (defaults.subjectId ?? ''),
    gradeLevelId: id(post?.gradeLevelId) || (defaults.gradeLevelId ?? ''),
    goal: post?.goal ?? defaults.goal ?? 'reinforce',
    goalNote: post?.goalNote ?? '',
    teachingMode: post?.teachingMode ?? defaults.teachingMode ?? 'in_person',
    provinceId: id(post?.provinceId) || (defaults.provinceId ?? ''),
    communeId: id(post?.communeId) || (defaults.communeId ?? ''),
    budgetMin: money(post?.budget?.minVnd),
    budgetMax: money(post?.budget?.maxVnd),
    budgetUnit: post?.budget?.unit ?? 'session',
    desiredStartDate: post?.desiredStartDate ? isoToDisplay(post.desiredStartDate) : '',
    tutorRequirements: post?.tutorRequirements ?? '',
    description: post?.description ?? '',
    slots: JSON.stringify(post?.slots ?? []),
  };
}

export function requestPostFieldErrors(error: ApiError): Errors<RequestPostField> {
  return errorsFrom(error, (path) => {
    const [head, second] = path.split('.');
    if (head === 'budget') {
      if (second === 'minVnd') return 'budgetMin';
      if (second === 'unit') return 'budgetUnit';
      return 'budgetMax';
    }
    return REQUEST_POST_FIELDS.find((field) => field === head);
  });
}
