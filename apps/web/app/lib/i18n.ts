import { DEFAULT_LOCALE, messages, type Locale } from '@tps/shared';
import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Tạo một instance i18next cho một ngôn ngữ. Chuỗi lấy từ @tps/shared (dùng chung với mobile).
 * Khởi tạo đồng bộ (tài nguyên có sẵn) để SSR render đúng ngôn ngữ ngay lần đầu.
 */
export function createI18n(locale: Locale): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    resources: {
      vi: { translation: messages.vi },
      en: { translation: messages.en },
    },
    interpolation: { escapeValue: false }, // React đã tự escape.
    initAsync: false,
    returnNull: false,
  });
  return instance;
}
