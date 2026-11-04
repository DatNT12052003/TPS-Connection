export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

export const isLocale = (value: string | undefined): value is Locale =>
  LOCALES.includes(value as Locale);

const vi = {
  'meta.title': 'TPS-Connection: Kết nối gia sư, phụ huynh và học sinh',
  'meta.description': 'Tìm gia sư phù hợp và theo dõi việc học trên cùng một nền tảng.',
  'home.heading': 'Kết nối gia sư, phụ huynh và học sinh',
  'home.subjects': 'Các môn học',
  'home.subjectsEmpty': 'Chưa có môn học nào.',
  'language.switch': 'English',
  'error.title': 'Đã có lỗi xảy ra',
  'error.notFound': 'Không tìm thấy trang này.',
  'error.unavailable': 'Hệ thống tạm thời chưa sẵn sàng. Vui lòng thử lại sau.',
};

export type MessageKey = keyof typeof vi;

const en: Record<MessageKey, string> = {
  'meta.title': 'TPS-Connection: Connecting tutors, parents and students',
  'meta.description': 'Find the right tutor and follow learning progress on one platform.',
  'home.heading': 'Connecting tutors, parents and students',
  'home.subjects': 'Subjects',
  'home.subjectsEmpty': 'No subjects yet.',
  'language.switch': 'Tiếng Việt',
  'error.title': 'Something went wrong',
  'error.notFound': 'This page could not be found.',
  'error.unavailable': 'The system is temporarily unavailable. Please try again later.',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { vi, en };

export const translate = (locale: Locale, key: MessageKey): string => MESSAGES[locale][key];
