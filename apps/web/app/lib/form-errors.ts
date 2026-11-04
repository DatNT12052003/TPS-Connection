import type { MessageKey } from './i18n';

type Problem = { code?: string; fields?: { path: string; code: string }[] };

export type FormResult = {
  ok: false;
  /** Shown above the form when no single field is to blame. */
  formError?: MessageKey;
  fieldErrors: Record<string, MessageKey>;
};

const KNOWN_CODES = new Set([
  'INVALID_CREDENTIALS',
  'LOGIN_TEMPORARILY_BLOCKED',
  'ACCOUNT_LOCKED',
  'TOO_MANY_REQUESTS',
  'EMAIL_NOT_VERIFIED',
  'CSRF_TOKEN_INVALID',
  'REVERIFICATION_REQUIRED',
  'CATALOG_DUPLICATE',
]);

const fieldMessage = (name: string, code: string): MessageKey => {
  if (code === 'PASSWORD_TOO_COMMON') return 'fieldError.passwordCommon';
  if (code === 'WRONG_PASSWORD') return 'fieldError.wrongPassword';
  if (code === 'NOT_SELECTABLE') return 'fieldError.notSelectable';
  if (code === 'EMAIL_UNCHANGED') return 'fieldError.emailUnchanged';
  switch (name) {
    case 'email':
    case 'newEmail':
      return 'fieldError.email';
    case 'phone':
      return 'fieldError.phone';
    case 'subjectIds':
    case 'gradeIds':
    case 'regionIds':
    case 'teachingModes':
    case 'tutorType':
      return 'fieldError.chooseOne';
    case 'availability':
      return 'fieldError.availability';
    case 'pricePerLessonVnd':
      return 'fieldError.price';
    case 'lessonMinutes':
      return 'fieldError.minutes';
    case 'legalName':
    case 'organization':
    case 'introduction':
    case 'experience':
    case 'teachingMethod':
      return 'fieldError.textLength';
    case 'nameVi':
    case 'nameEn':
      return 'fieldError.catalogName';
    case 'nickname':
      return 'fieldError.nickname';
    case 'fullName':
      return 'fieldError.fullName';
    case 'gradeId':
      return 'fieldError.grade';
    case 'acceptedOnBehalf':
      return 'fieldError.consent';
    case 'currentPassword':
      return 'fieldError.wrongPassword';
    case 'password':
    case 'newPassword':
      return 'fieldError.password';
    case 'displayName':
      return 'fieldError.displayName';
    case 'role':
      return 'fieldError.role';
    case 'acceptedTerms':
      return 'fieldError.terms';
    default:
      return 'fieldError.required';
  }
};

/** The API sends stable codes and this client words them (NFR-U04). Unknown codes get a default. */
export function toFormResult(problem: Problem | undefined): FormResult {
  const fieldErrors: Record<string, MessageKey> = {};
  for (const field of problem?.fields ?? []) {
    // Errors inside a list belong to the list: availability.0.endTime is availability.
    const name = field.path.replace(/^body\./, '').split('.')[0] as string;
    fieldErrors[name] = fieldMessage(name, field.code);
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const code = problem?.code;
  return {
    ok: false,
    fieldErrors,
    formError: code && KNOWN_CODES.has(code) ? (`code.${code}` as MessageKey) : 'code.DEFAULT',
  };
}
