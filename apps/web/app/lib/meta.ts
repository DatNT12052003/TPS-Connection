import { DEFAULT_LOCALE, Locale, messages, type Messages } from '@tps/shared';

type Match = { id: string; loaderData?: unknown } | undefined;

/**
 * Chuỗi theo ngôn ngữ hiện tại cho hàm `meta` của route (meta chạy ngoài React, không dùng được hook i18n).
 * Ngôn ngữ lấy từ loader của root.
 */
export function messagesFromMatches(matches: readonly Match[]): Messages {
  const root = matches.find((match) => match?.id === 'root');
  const data = root?.loaderData as { preferences?: { locale?: unknown } } | undefined;
  const locale = Locale.catch(DEFAULT_LOCALE).parse(data?.preferences?.locale);
  return messages[locale];
}
