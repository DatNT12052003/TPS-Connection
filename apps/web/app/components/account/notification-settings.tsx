// Thẻ "Thông báo" ở trang Tài khoản (G5, §12): bật/tắt thông báo trong ứng dụng và email theo loại. Một form, một nút
// Lưu (intent `notifications`); ô đánh dấu gửi tên `<type>.inApp` / `<type>.email`. Loại không có tùy chọn email
// (kết quả xác minh: email luôn gửi) hiện chữ "Luôn gửi".
import type { NotificationPreferences } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { Form } from 'react-router';
import { Alert } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import type { Message } from '~/lib/form';
import { useMessage } from '~/lib/use-message';

export function NotificationSettingsCard({
  preferences,
  result,
  submitting,
}: {
  preferences: NotificationPreferences;
  result?: { ok: true } | { ok: false; formError: Message } | undefined;
  submitting: boolean;
}) {
  const { t } = useTranslation();
  const tr = useMessage();
  const checkbox = 'size-5 accent-primary';
  return (
    <Card id="notifications" className="scroll-mt-24 gap-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('notificationSettings.title')}</h2>
        <p className="text-small text-muted-foreground">{t('notificationSettings.lead')}</p>
      </div>
      {result?.ok === true && <Alert variant="success">{t('notificationSettings.saved')}</Alert>}
      {result?.ok === false && <Alert variant="danger">{tr(result.formError)}</Alert>}
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="notifications" />
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-small text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t('notificationSettings.type')}
              </th>
              <th scope="col" className="w-28 py-2 text-center font-semibold">
                {t('notificationSettings.inApp')}
              </th>
              <th scope="col" className="w-28 py-2 text-center font-semibold">
                {t('notificationSettings.email')}
              </th>
            </tr>
          </thead>
          <tbody>
            {preferences.items.map((p) => {
              const label = t(`notificationType.${p.type}`);
              return (
                <tr key={p.type} className="border-b border-border last:border-b-0">
                  <th scope="row" className="py-3 pr-3 font-normal">
                    {label}
                  </th>
                  <td className="py-3 text-center">
                    <input
                      type="checkbox"
                      name={`${p.type}.inApp`}
                      defaultChecked={p.inApp}
                      aria-label={`${label}: ${t('notificationSettings.inApp')}`}
                      className={checkbox}
                    />
                  </td>
                  <td className="py-3 text-center">
                    {p.email === null ? (
                      <span className="text-small text-muted-foreground">
                        {t('notificationSettings.emailAlways')}
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        name={`${p.type}.email`}
                        defaultChecked={p.email}
                        aria-label={`${label}: ${t('notificationSettings.email')}`}
                        className={checkbox}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div>
          <Button type="submit" variant="secondary" disabled={submitting}>
            {t('notificationSettings.save')}
          </Button>
        </div>
      </Form>
    </Card>
  );
}

/** Body cho API từ form: ô đánh dấu không gửi khi bỏ chọn, nên mỗi loại gửi đủ giá trị. */
export function notificationPreferencesBody(
  form: FormData,
  current: NotificationPreferences,
): { items: { type: string; inApp: boolean; email?: boolean }[] } {
  return {
    items: current.items.map((p) => ({
      type: p.type,
      inApp: form.has(`${p.type}.inApp`),
      ...(p.email !== null && { email: form.has(`${p.type}.email`) }),
    })),
  };
}
