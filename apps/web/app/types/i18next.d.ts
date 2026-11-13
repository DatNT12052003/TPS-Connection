// Kiểu cho t(): khóa sai (ví dụ t('nav.overveiw')) là lỗi type-check.
import 'i18next';
import type { vi } from '@tps/shared';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof vi };
  }
}
