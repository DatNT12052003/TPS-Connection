// Thẻ gia sư trong kết quả tìm kiếm (canvas Main): ảnh, tên hiển thị (không phải họ tên thật, D16), giới thiệu
// ngắn, nhãn đã xác minh, môn – khối, khu vực và hình thức, học phí tham khảo. Cả thẻ là liên kết tới hồ sơ.
import type { TutorSearchItem } from '@tps/shared';
import { Award, ChevronRight, MapPin, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AvatarImage } from '~/components/account/avatar-field';
import { Badge } from '~/components/ui/badge';
import { cardVariants } from '~/components/ui/card';
import { labelOf } from '~/lib/catalog';
import { type Catalogs, rateLabel, summarizeSubjects } from '~/lib/marketplace';
import { cn } from '~/lib/utils';

export function TutorCard({ tutor, catalogs }: { tutor: TutorSearchItem; catalogs: Catalogs }) {
  const { t, i18n } = useTranslation();
  const subline = [
    tutor.headline,
    tutor.experienceYears !== null &&
      t('tutorProfile.yearsCount', { count: tutor.experienceYears }),
  ]
    .filter(Boolean)
    .join(' · ');
  const provinces = tutor.provinceIds
    .map((id) => labelOf(catalogs.provinces, id))
    .filter(Boolean)
    .join(', ');
  const place = [provinces, tutor.teachingMode && t(`teachingMode.${tutor.teachingMode}`)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={`/tutors/${tutor.slug}`}
      className={cn(cardVariants({ variant: 'interactive' }), 'h-full gap-3.5')}
    >
      <div className="flex items-center gap-3.5">
        <AvatarImage
          avatarUrl={tutor.avatarUrl}
          displayName={tutor.displayName}
          className="size-14 text-h3"
        />
        <div className="flex min-w-0 flex-col">
          <h3 className="text-h3">{tutor.displayName}</h3>
          {subline && (
            <span className="line-clamp-2 text-small text-muted-foreground">{subline}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="verified">
          <ShieldCheck aria-hidden="true" />
          {t('tutorProfile.identityVerified')}
        </Badge>
        {tutor.hasVerifiedDegree && (
          <Badge variant="verified">
            <Award aria-hidden="true" />
            {t('tutorProfile.degreeVerified')}
          </Badge>
        )}
        {!tutor.acceptingStudents && (
          <Badge variant="neutral">{t('marketplace.notAccepting')}</Badge>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="line-clamp-2">
          {summarizeSubjects(tutor.subjects, catalogs.subjects, catalogs.grades) ||
            t('marketplace.noSubjects')}
        </span>
        {place && (
          <span className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {place}
          </span>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-body-strong">
          {tutor.rate ? rateLabel(t, i18n.language, tutor.rate) : t('marketplace.rateUnset')}
        </span>
        <span className="inline-flex items-center gap-1 text-small font-semibold text-primary">
          {t('marketplace.viewProfile')}
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      </div>
    </Link>
  );
}
