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
]);

const fieldMessage = (name: string, code: string): MessageKey => {
  if (code === 'PASSWORD_TOO_COMMON') return 'fieldError.passwordCommon';
  if (code === 'WRONG_PASSWORD') return 'fieldError.wrongPassword';
  if (code === 'EMAIL_UNCHANGED') return 'fieldError.emailUnchanged';
  switch (name) {
    case 'email':
    case 'newEmail':
      return 'fieldError.email';
    case 'phone':
      return 'fieldError.phone';
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
    const name = field.path.replace(/^body\./, '');
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
