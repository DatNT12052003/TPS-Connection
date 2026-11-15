// Các ô của hồ sơ con, theo canvas ChildProfile / ChildProfileMobile: thẻ "Thông tin học tập" (gia sư thấy
// khi trao đổi) và thẻ "Thông tin nhận dạng" (chỉ hiện sau khi xác nhận hợp tác, D16). Dùng cho cả màn tạo
// và màn sửa; nút gửi do trang đặt.
import { GuardianRelationship } from '@tps/shared';
import { Eye, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocationFields } from '~/components/forms/location-fields';
import { Badge } from '~/components/ui/badge';
import { Card, CardHeader } from '~/components/ui/card';
import { DateField } from '~/components/ui/date-field';
import { SelectField, TextAreaField, TextField } from '~/components/ui/field';
import type { CatalogOption } from '~/lib/catalog';
import { todayIso } from '~/lib/dates';
import type { Message } from '~/lib/form';
import type { LearnerField, LearnerFormValues } from '~/lib/learners';
import { useMessage } from '~/lib/use-message';

export interface LearnerCatalogs {
  gradeLevels: CatalogOption[];
  provinces: CatalogOption[];
  /** Xã của tỉnh đang chọn ban đầu. */
  communes: CatalogOption[];
}

interface LearnerFormFieldsProps {
  catalogs: LearnerCatalogs;
  values: LearnerFormValues;
  errors: Partial<Record<LearnerField, Message>>;
}

export function LearnerFormFields({ catalogs, values, errors }: LearnerFormFieldsProps) {
  const { t } = useTranslation();
  const tr = useMessage();

  return (
    <>
      <Card className="gap-4.5 sm:p-6">
        <CardHeader>
          <h2 className="text-h3">{t('learnerForm.studyTitle')}</h2>
          <Badge variant="verified">
            <Eye aria-hidden="true" />
            {t('learnerForm.studyBadge')}
          </Badge>
        </CardHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            name="nickname"
            maxLength={50}
            label={t('learnerForm.nickname')}
            hint={t('learnerForm.nicknameHint')}
            defaultValue={values.nickname}
            error={tr(errors.nickname)}
          />
          <SelectField
            name="gradeLevelId"
            required
            label={t('learnerForm.gradeLevel')}
            defaultValue={values.gradeLevelId}
            error={tr(errors.gradeLevelId)}
          >
            <option value="">{t('location.choose')}</option>
            {catalogs.gradeLevels.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </SelectField>
          <LocationFields
            provinces={catalogs.provinces}
            communes={catalogs.communes}
            provinceId={values.provinceId}
            communeId={values.communeId}
            provinceError={tr(errors.provinceId)}
            communeError={tr(errors.communeId)}
          />
        </div>
      </Card>

      <Card className="gap-4.5 sm:p-6">
        <CardHeader>
          <h2 className="text-h3">{t('learnerForm.identityTitle')}</h2>
          <Badge variant="neutral">
            <Lock aria-hidden="true" />
            {t('learnerForm.identityBadge')}
          </Badge>
        </CardHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            name="fullName"
            required
            maxLength={100}
            autoComplete="off"
            label={t('learnerForm.fullName')}
            defaultValue={values.fullName}
            error={tr(errors.fullName)}
          />
          <SelectField
            name="relationship"
            required
            label={t('learnerForm.relationship')}
            defaultValue={values.relationship}
            error={tr(errors.relationship)}
          >
            <option value="">{t('location.choose')}</option>
            {GuardianRelationship.options.map((r) => (
              <option key={r} value={r}>
                {t(`guardianRelationship.${r}`)}
              </option>
            ))}
          </SelectField>
          <DateField
            name="dateOfBirth"
            min="1900-01-01"
            max={todayIso()}
            initialMonth={`${new Date().getFullYear() - 10}-01-01`}
            label={t('learnerForm.dateOfBirth')}
            hint={t('learnerForm.dateOfBirthHint')}
            defaultValue={values.dateOfBirth}
            error={tr(errors.dateOfBirth)}
          />
          <TextField
            name="schoolName"
            maxLength={200}
            label={t('learnerForm.school')}
            placeholder={t('learnerForm.optional')}
            defaultValue={values.schoolName}
            error={tr(errors.schoolName)}
          />
          <TextField
            name="addressLine"
            maxLength={300}
            className="md:col-span-2"
            label={t('learnerForm.address')}
            placeholder={t('learnerForm.addressPlaceholder')}
            defaultValue={values.addressLine}
            error={tr(errors.addressLine)}
          />
          <TextAreaField
            name="notes"
            maxLength={1000}
            className="md:col-span-2"
            label={t('learnerForm.notes')}
            hint={t('learnerForm.notesHint')}
            defaultValue={values.notes}
            error={tr(errors.notes)}
          />
        </div>
        <p className="text-small text-muted-foreground">{t('learnerForm.identityNote')}</p>
      </Card>
    </>
  );
}

/** Cột bên: gia sư thấy gì khi trao đổi, và gì được ẩn (canvas ChildProfile). */
export function LearnerPrivacyAside() {
  const { t } = useTranslation();
  return (
    <Card className="gap-3">
      <span className="text-overline text-muted-foreground">{t('learnerForm.asideTitle')}</span>
      <ul className="flex flex-col gap-2 text-small">
        <li className="flex items-start gap-2">
          <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          {t('learnerForm.asideVisible')}
        </li>
        <li className="flex items-start gap-2 text-muted-foreground">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('learnerForm.asideHidden')}
        </li>
      </ul>
    </Card>
  );
}
