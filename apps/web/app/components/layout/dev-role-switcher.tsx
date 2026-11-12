// TẠM THỜI, chỉ hiện ở môi trường dev: chọn vai trò để xem layout khi chưa có đăng nhập (G2 bỏ).
import type { Role } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { Form, useLocation } from 'react-router';
import { Button } from '~/components/ui/button';

const ROLES: Role[] = ['tutor', 'parent', 'student', 'manager', 'admin'];

export function DevRoleSwitcher({ current }: { current: Role }) {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Form
      method="post"
      action="/dev/role"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-dashed border-warning bg-warning-subtle px-4 py-1.5 text-small text-warning"
    >
      <input type="hidden" name="redirectTo" value={location.pathname} />
      <label htmlFor="dev-role" className="font-semibold">
        {t('dev.roleSwitcher')}
      </label>
      <select
        id="dev-role"
        name="role"
        defaultValue={current}
        className="min-h-9 rounded-md border border-border-strong bg-surface px-2 text-foreground"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {t(`role.${role}`)}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" className="min-h-9 px-3">
        {t('dev.apply')}
      </Button>
      <span>{t('dev.roleSwitcherNote')}</span>
    </Form>
  );
}
