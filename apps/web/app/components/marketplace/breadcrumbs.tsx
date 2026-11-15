// Đường dẫn vị trí (canvas: `.crumbs`): các mục trước là liên kết, mục cuối là trang hiện tại.
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export interface Crumb {
  label: string;
  /** Không có: mục hiện tại. */
  to?: string;
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('layout.breadcrumb')} className="text-small text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true">›</span>}
            {item.to ? (
              <Link to={item.to} className="font-semibold text-primary hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="line-clamp-1">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
