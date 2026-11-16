// Hiển thị yêu cầu kết nối (G5) cho hộp yêu cầu, trang chi tiết và trang tổng quan. Không có thông tin của trẻ ngoài
// tên con mà phụ huynh tự đặt (`learner`, chỉ phụ huynh nhận được từ API).
import type {
  ConnectionNeed,
  ConnectionRequestStatus,
  ConnectionRequestSummary,
  ConnectionTerms,
  TermsScheduleEntry,
} from '@tps/shared';
import type { TFunction } from 'i18next';
import type { BadgeProps } from '~/components/ui/badge';
import { labelOf } from './catalog';
import type { Catalogs } from './marketplace';

export const CONNECTION_STATUS_BADGE: Record<ConnectionRequestStatus, BadgeProps['variant']> = {
  pending: 'warning',
  negotiating: 'verified',
  confirmed: 'success',
  rejected: 'neutral',
  cancelled: 'neutral',
};

/** Bên kia của yêu cầu, theo vai trò của người xem. Gia sư chưa biết tên phụ huynh khi yêu cầu chưa được chấp nhận. */
export function counterpartName(t: TFunction, request: ConnectionRequestSummary): string {
  if (request.myRole === 'client') return request.tutor.displayName;
  return request.client?.displayName ?? t('connections.aParent');
}

/** "Toán · Lớp 8 · Ôn thi · Trực tuyến". */
export function needSummary(
  t: TFunction,
  need: Pick<ConnectionNeed, 'subjectId' | 'gradeLevelId' | 'goal' | 'teachingMode'>,
  catalogs: Pick<Catalogs, 'subjects' | 'grades'>,
): string {
  return [
    labelOf(catalogs.subjects, need.subjectId),
    labelOf(catalogs.grades, need.gradeLevelId),
    t(`requestPostGoal.${need.goal}`),
    t(`teachingMode.${need.teachingMode}`),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Ai đang phải làm gì tiếp theo, để người xem biết trạng thái của mình. */
export function nextStepKey(
  request: ConnectionRequestSummary,
  terms: ConnectionTerms | null,
):
  | 'connections.stepReply'
  | 'connections.stepWaitReply'
  | 'connections.stepProposeTerms'
  | 'connections.stepConfirm'
  | 'connections.stepWaitConfirm'
  | null {
  if (request.status === 'pending') {
    return request.isSender ? 'connections.stepWaitReply' : 'connections.stepReply';
  }
  if (request.status !== 'negotiating') return null;
  if (!terms) return 'connections.stepProposeTerms';
  const mine = request.myRole === 'tutor' ? terms.tutorConfirmedAt : terms.clientConfirmedAt;
  return mine ? 'connections.stepWaitConfirm' : 'connections.stepConfirm';
}

/** "Thứ 3 18:00, Thứ 6 18:00". */
export function scheduleLabel(t: TFunction, schedule: readonly TermsScheduleEntry[]): string {
  return schedule
    .map((s) => `${t(`weekday.${s.weekday}` as 'weekday.1')} ${s.startTime}`)
    .join(', ');
}
