import type { Locale } from '../schemas/common.js';
import { en } from './en.js';
import type { Messages } from './types.js';
import { vi } from './vi.js';

export type { EnumLabels, Messages } from './types.js';
export { en, vi };

/** Tài nguyên cho i18next: `i18next.init({ resources: { vi: { translation: messages.vi }, ... } })`. */
export const messages: Record<Locale, Messages> = { vi, en };
