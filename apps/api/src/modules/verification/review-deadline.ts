// Hạn duyệt xác minh: 2 ngày làm việc (C4). Không tính thứ Bảy, Chủ nhật; chưa trừ ngày lễ (D26).
// "Hồ sơ nộp thứ Sáu thì hạn là hết thứ Ba tuần sau." Tính theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè).

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày làm việc Manager có để duyệt (C4). */
export const REVIEW_BUSINESS_DAYS = 2;

/**
 * Hạn duyệt cho một yêu cầu nộp lúc `submittedAt`: hết ngày (23:59:59.999 giờ Việt Nam) của ngày làm việc
 * thứ `businessDays` tính từ ngày hôm sau. Nộp thứ Hai: hết thứ Tư; nộp thứ Sáu, thứ Bảy hay Chủ nhật: hết thứ Ba.
 */
export function reviewDueAt(submittedAt: Date, businessDays = REVIEW_BUSINESS_DAYS): Date {
  // Nửa đêm (giờ Việt Nam) của ngày nộp, biểu diễn như thể là UTC để dùng getUTCDay.
  let day = Math.floor((submittedAt.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS;
  let remaining = businessDays;
  while (remaining > 0) {
    day += DAY_MS;
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return new Date(day + DAY_MS - 1 - VN_OFFSET_MS);
}
