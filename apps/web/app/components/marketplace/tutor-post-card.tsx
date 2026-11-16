// Thẻ bài tuyển học sinh trong danh sách (canvas PostList): tiêu đề, gia sư, môn – khối, hình thức và khu vực,
// ngày bắt đầu, học phí, số chỗ. Cả thẻ là liên kết tới bài.
import type { TutorPostSummary } from '@tps/shared';
import { BookOpen, CalendarDays, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { cardVariants } from '~/components/ui/card';
import { formatDate } from '~/lib/format';
import { type Catalogs, rateLabel, summarizeSubjects } from '~/lib/marketplace';
import { cn } from '~/lib/utils';

export function TutorPostCard({ post, catalogs }: { post: TutorPostSummary; catalogs: Catalogs }) {
  const { t, i18n } = useTranslation();
  return (
    <Link
      to={`/tutor-posts/${post.slug}`}
      className={cn(cardVariants({ variant: 'interactive' }), 'h-full gap-3.5')}
    >
      <h3 className="text-h3">{post.title}</h3>
      <div className="flex items-center gap-2.5">
        <AvatarImage
          avatarUrl={post.tutor.avatarUrl}
          displayName={post.tutor.displayName}
          className="size-9 text-small"
        />
        <span className="flex flex-col">
          <span className="font-semibold">{post.tutor.displayName}</span>
          <span className="text-small text-primary-subtle-foreground">
            {t('tutorProfile.identityVerified')}
          </span>
        </span>
      </div>
      <p className="line-clamp-2 text-small text-muted-foreground">{post.excerpt}</p>
      <div className="grid gap-x-4 gap-y-2 text-small text-muted-foreground sm:grid-cols-2">
        <span className="inline-flex items-start gap-1.5">
          <BookOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {summarizeSubjects(post.subjects, catalogs.subjects, catalogs.grades) ||
            t('marketplace.noSubjects')}
        </span>
        {post.teachingMode && (
          <span className="inline-flex items-start gap-1.5">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t(`teachingMode.${post.teachingMode}`)}
          </span>
        )}
        <span className="inline-flex items-start gap-1.5">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {post.availableFrom
            ? t('marketplace.startsOn', { date: formatDate(post.availableFrom, i18n.language) })
            : t('marketplace.startsNow')}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-body-strong">
          {post.rate ? rateLabel(t, i18n.language, post.rate) : t('marketplace.rateUnset')}
        </span>
        {post.capacity !== null && (
          <span className="text-small font-semibold">
            {t('marketplace.capacity', { count: post.capacity })}
          </span>
        )}
      </div>
    </Link>
  );
}
