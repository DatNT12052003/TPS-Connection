// Form hồ sơ con (tạo và sửa dùng chung): giá trị form <-> body gửi API (`/api/v1/learners`).
import type { Learner } from '@tps/shared';
import { type CatalogOption, catalogIdFrom } from './catalog';
import { displayToIso, isoToDisplay } from './dates';
import { formText, type Message } from './form';

export const LEARNER_FIELDS = [
  'nickname',
  'gradeLevelId',
  'provinceId',
  'communeId',
  'fullName',
  'relationship',
  'dateOfBirth',
  'schoolName',
  'addressLine',
  'notes',
] as const;
export type LearnerField = (typeof LEARNER_FIELDS)[number];
export type LearnerFormValues = Record<LearnerField, string>;

/** Ô đồng ý xử lý dữ liệu của con: chỉ có khi tạo hồ sơ. */
export const CONSENT_FIELD = 'acceptChildDataProcessing';

/** Action tạo/sửa hồ sơ con chưa thành công: lỗi, giá trị đã nhập, xã của tỉnh đã chọn. */
export interface LearnerFormFailure<F extends string = LearnerField> {
  ok: false;
  fieldErrors: Partial<Record<F, Message>>;
  formError?: Message;
  values: LearnerFormValues;
  communes: CatalogOption[];
}

export function learnerValuesFrom(form: FormData): LearnerFormValues {
  return Object.fromEntries(
    LEARNER_FIELDS.map((field) => [field, formText(form, field)]),
  ) as LearnerFormValues;
}

/**
 * Body cho API. Ô để trống gửi `null` (khi sửa là xóa giá trị); văn bản để API tự cắt khoảng trắng và
 * kiểm tra độ dài. Khối lớp, quan hệ là bắt buộc: để trống thì gửi undefined để API báo `required`.
 */
export function learnerBody(values: LearnerFormValues) {
  return {
    nickname: values.nickname,
    gradeLevelId: catalogIdFrom(values.gradeLevelId) ?? undefined,
    provinceId: catalogIdFrom(values.provinceId),
    communeId: catalogIdFrom(values.communeId),
    fullName: values.fullName,
    relationship: values.relationship || undefined,
    // Ô ngày gửi `dd/mm/yyyy`; gõ sai dạng thì gửi nguyên văn để API báo `invalid_date` đúng ô.
    dateOfBirth: values.dateOfBirth.trim()
      ? (displayToIso(values.dateOfBirth) ?? values.dateOfBirth)
      : null,
    schoolName: values.schoolName,
    addressLine: values.addressLine,
    notes: values.notes,
  };
}

/** Giá trị ban đầu của form sửa, từ hồ sơ đã lưu. */
export function learnerFormValues(learner: Learner): LearnerFormValues {
  const text = (value: string | number | null) => (value === null ? '' : String(value));
  return {
    nickname: text(learner.nickname),
    gradeLevelId: text(learner.gradeLevelId),
    provinceId: text(learner.provinceId),
    communeId: text(learner.communeId),
    fullName: text(learner.fullName),
    relationship: text(learner.relationship),
    dateOfBirth: learner.dateOfBirth ? isoToDisplay(learner.dateOfBirth) : '',
    schoolName: text(learner.schoolName),
    addressLine: text(learner.addressLine),
    notes: text(learner.notes),
  };
}

export const EMPTY_LEARNER_VALUES: LearnerFormValues = Object.fromEntries(
  LEARNER_FIELDS.map((field) => [field, '']),
) as LearnerFormValues;

/** Tên hiển thị của con trong danh sách: tên gọi nếu có, không thì họ tên. */
export const learnerName = (learner: Pick<Learner, 'nickname' | 'fullName'>): string =>
  learner.nickname ?? learner.fullName ?? '';

/** Chữ cái đầu cho ô ảnh đại diện. */
export const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || '?';
