// Thẻ "Phụ huynh sẽ thấy" (canvas TutorProfileEdit, cột phải): tóm tắt hồ sơ đã lưu như trên trang công
// khai: tên hiển thị (không phải họ tên thật, D16), nghề nghiệp, môn – khối, hình thức dạy, học phí.
import type { OwnTutorProfile } from '@tps/shared';
import { useTranslation } from 'react-i18next';
import { AvatarImage } from '~/components/account/avatar-field';
import { Badge } from '~/components/ui/badge';
import { Card } from '~/components/ui/card';
import type { CatalogOption } from '~/lib/catalog';
import { formatMoney, groupBySubject, summarizeGrades } from '~/lib/tutor-profile';

export function TutorProfilePreview({
  profile,
  displayName,
  avatarUrl,
  subjects,
  grades,
}: {
  profile: OwnTutorProfile;
  displayName: string;
  avatarUrl: string | null;
  subjects: readonly CatalogOption[];
  grades: readonly CatalogOption[];
}) {
  const { t, i18n } = useTranslation();
  const occupation = [
    profile.occupation && t(`tutorOccupation.${profile.occupation}`),
    profile.experienceYears !== null &&
      t('tutorProfile.yearsCount', { count: profile.experienceYears }),
  ]
    .filter(Boolean)
    .join(' · ');
  const subjectSummary = [...groupBySubject(profile.teachingSubjects)]
    .map(([subjectId, gradeIds]) => {
      const name = subjects.find((s) => s.id === subjectId)?.label;
      return name && `${name} ${summarizeGrades(gradeIds, grades)}`;
    })
    .filter(Boolean)
    .join('; ');

  return (
    <Card className="gap-3 p-5">
      <span className="text-overline text-muted-foreground">{t('tutorProfile.previewTitle')}</span>
      <div className="flex items-center gap-3">
        <AvatarImage avatarUrl={avatarUrl} displayName={displayName} className="size-13 text-h3" />
        <div className="flex min-w-0 flex-col">
          <span className="text-h3">{displayName}</span>
          {occupation && <span className="text-small text-muted-foreground">{occupation}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {profile.identityVerifiedAt ? (
          <Badge variant="verified">{t('tutorProfile.identityVerified')}</Badge>
        ) : (
          <Badge variant="neutral">{t('tutorProfile.identityNotVerified')}</Badge>
        )}
        {profile.hasVerifiedDegree && (
          <Badge variant="verified">{t('tutorProfile.degreeVerified')}</Badge>
        )}
      </div>
      <p className="text-small">
        {subjectSummary || (
          <span className="text-muted-foreground">{t('tutorProfile.previewNoSubjects')}</span>
        )}
        {profile.teachingMode && ` · ${t(`teachingMode.${profile.teachingMode}`)}`}
      </p>
      {profile.rate && (
        <p className="text-body-strong">
          {t('tutorProfile.rateValue', {
            amount: formatMoney(profile.rate.amountVnd, i18n.language),
            unit: t(
              profile.rate.unit === 'hour' ? 'tutorProfile.perHour' : 'tutorProfile.perSession',
            ),
          })}
        </p>
      )}
      <p className="text-small text-muted-foreground">{t('tutorProfile.previewNote')}</p>
    </Card>
  );
}
