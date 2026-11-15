// Phân trang của trang tìm kiếm (canvas Main, PostList): Trước, các số trang gần trang hiện tại, Sau. Là liên kết
// (GET) nên dùng được khi chưa tải JavaScript và máy tìm kiếm đi theo được.
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonVariants } from '~/components/ui/button';
import { pageCount, pageHref } from '~/lib/marketplace';
import { cn } from '~/lib/utils';

/** Số trang hiện quanh trang hiện tại (mỗi bên). */
const AROUND = 2;

export function Pagination({
  pathname,
  params,
  page,
  pageSize,
  total,
  maxPage,
}: {
  pathname: string;
  /** Query hiện tại (bộ lọc), không gồm `page`. */
  params: URLSearchParams;
  page: number;
  pageSize: number;
  total: number;
  /** Trang lớn nhất API cho phép. */
  maxPage: number;
}) {
  const { t } = useTranslation();
  const last = Math.min(pageCount(total, pageSize), maxPage);
  if (last <= 1) return null;
  const pages: number[] = [];
  for (let p = Math.max(1, page - AROUND); p <= Math.min(last, page + AROUND); p += 1)
    pages.push(p);
  const link = (p: number) => pageHref(pathname, params, p);
  const secondary = buttonVariants({ variant: 'secondary' });

  return (
    <nav aria-label={t('marketplace.pagination')} className="flex flex-wrap justify-center gap-2">
      {page > 1 ? (
        <Link to={link(page - 1)} className={secondary} rel="prev">
          {t('marketplace.previous')}
        </Link>
      ) : (
        <span className={secondary} aria-disabled="true">
          {t('marketplace.previous')}
        </span>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          to={link(p)}
          aria-current={p === page ? 'page' : undefined}
          aria-label={t('marketplace.pageN', { page: p })}
          className={cn(
            buttonVariants({ variant: p === page ? 'primary' : 'secondary' }),
            'min-w-control-md px-3',
          )}
        >
          {p}
        </Link>
      ))}
      {page < last ? (
        <Link to={link(page + 1)} className={secondary} rel="next">
          {t('marketplace.next')}
        </Link>
      ) : (
        <span className={secondary} aria-disabled="true">
          {t('marketplace.next')}
        </span>
      )}
    </nav>
  );
}
