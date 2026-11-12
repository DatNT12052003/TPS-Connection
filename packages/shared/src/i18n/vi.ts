// Chuỗi giao diện tiếng Việt (ngôn ngữ gốc). Khóa theo quy ước `<miền>.<khóa>` của docs/thuat_ngu_va_trang_thai.md (A.4).
// Giọng văn theo README hệ thống thiết kế: gọi người dùng là "bạn", lỗi nói rõ sai gì và sửa thế nào.
import type { EnumLabels } from './types.js';

export const vi = {
  common: {
    appName: 'TPS-Connection',
    save: 'Lưu',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    back: 'Quay lại',
    retry: 'Thử lại',
    loading: 'Đang tải…',
  },
  language: {
    vi: 'Tiếng Việt',
    en: 'English',
  },
  errors: {
    validation_failed: 'Một số thông tin chưa hợp lệ. Hãy kiểm tra các ô được đánh dấu.',
    unauthenticated: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
    forbidden: 'Bạn không có quyền thực hiện thao tác này.',
    not_found: 'Không tìm thấy nội dung bạn cần. Có thể nội dung đã bị xóa.',
    conflict: 'Dữ liệu vừa được thay đổi ở nơi khác. Hãy tải lại trang rồi thử lại.',
    invalid_state_transition:
      'Không thực hiện được vì trạng thái đã thay đổi. Hãy tải lại trang để xem trạng thái mới.',
    rate_limited: 'Bạn thao tác quá nhanh. Hãy chờ một lát rồi thử lại.',
    internal_error: 'Hệ thống gặp sự cố khi xử lý yêu cầu. Hãy thử lại sau ít phút.',
    service_unavailable: 'Hệ thống đang bảo trì hoặc quá tải. Hãy thử lại sau ít phút.',
  },
  validation: {
    required: 'Hãy nhập thông tin này.',
    invalid_email: 'Email chưa đúng định dạng, ví dụ: ten@gmail.com.',
    password_too_short: 'Mật khẩu cần ít nhất 8 ký tự.',
    password_too_long: 'Mật khẩu dài tối đa 128 ký tự.',
    password_needs_letter_and_digit: 'Mật khẩu cần có cả chữ và số.',
  },

  // ---- Nhãn trạng thái (đủ mọi giá trị trong statuses.ts) ----
  userStatus: {
    active: 'Đang hoạt động',
    restricted: 'Bị hạn chế',
    locked: 'Bị khóa',
  },
  role: {
    tutor: 'Gia sư',
    parent: 'Phụ huynh',
    student: 'Học sinh',
    manager: 'Người kiểm duyệt',
    admin: 'Quản trị viên',
  },
  tutorProfileStatus: {
    incomplete: 'Chưa hoàn thiện',
    pending_verification: 'Chờ xác minh',
    verified: 'Đã xác minh',
  },
  verificationRequestKind: {
    identity: 'Xác minh danh tính',
    credential: 'Xác minh bằng cấp',
  },
  verificationRequestStatus: {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Bị từ chối',
    cancelled: 'Đã hủy',
  },
  credentialKind: {
    degree: 'Bằng cấp',
    certificate: 'Chứng chỉ',
    student_card: 'Thẻ sinh viên',
  },
  credentialVerificationStatus: {
    self_declared: 'Tự khai',
    pending: 'Chờ xác minh',
    verified: 'Đã xác minh',
    rejected: 'Bị từ chối',
  },
  tutorPostStatus: {
    draft: 'Bản nháp',
    open: 'Đang mở',
    paused: 'Tạm dừng',
    full: 'Đã đủ học sinh',
    closed: 'Đã đóng',
  },
  requestPostStatus: {
    draft: 'Bản nháp',
    open: 'Đang mở',
    hidden: 'Đã ẩn',
    closed: 'Đã đóng',
  },
  requestPostClosedReason: {
    found_tutor: 'Đã tìm được gia sư',
    no_longer_needed: 'Không còn nhu cầu',
    other: 'Lý do khác',
  },
  teachingMode: {
    online: 'Trực tuyến',
    in_person: 'Trực tiếp',
    hybrid: 'Kết hợp',
  },
  connectionDirection: {
    client_to_tutor: 'Phụ huynh gửi yêu cầu',
    tutor_to_client: 'Gia sư ứng tuyển',
  },
  connectionRequestStatus: {
    pending: 'Chờ phản hồi',
    negotiating: 'Đang trao đổi',
    confirmed: 'Đã xác nhận hợp tác',
    rejected: 'Bị từ chối',
    cancelled: 'Đã hủy',
  },
  connectionCancelReason: {
    withdrawn: 'Bên gửi đã rút yêu cầu',
    ended_by_party: 'Một bên đã hủy',
    source_closed: 'Bài đăng đã đóng',
    expired_pending: 'Quá 7 ngày không phản hồi',
    expired_negotiating: 'Quá 30 ngày trao đổi',
  },
  tutoringClassStatus: {
    active: 'Đang học',
    paused: 'Tạm nghỉ',
    ended: 'Đã kết thúc',
  },
  enrollmentStatus: {
    active: 'Đang học',
    paused: 'Tạm nghỉ',
    left: 'Đã rời lớp',
  },
  feeRateStatus: {
    proposed: 'Đang đề xuất',
    active: 'Đang áp dụng',
    rejected: 'Bị từ chối',
    superseded: 'Đã thay thế',
    withdrawn: 'Đã rút',
  },
  lessonStatus: {
    scheduled: 'Đã lên lịch',
    held: 'Đã dạy',
    cancelled: 'Đã hủy',
    tutor_absent: 'Gia sư vắng',
  },
  attendanceStatus: {
    present: 'Có mặt',
    absent_notified: 'Vắng có báo',
    absent_no_show: 'Vắng không báo',
    not_applicable: 'Không áp dụng',
  },
  attendanceConfirmationStatus: {
    pending: 'Chờ xác nhận',
    confirmed: 'Đã xác nhận',
    auto_confirmed: 'Tự động xác nhận',
    disputed: 'Đang khiếu nại',
    resolved: 'Đã giải quyết',
  },
  attendanceDisputeStatus: {
    open: 'Đang trao đổi',
    settled_by_parties: 'Hai bên đã thống nhất',
    escalated: 'Đã chuyển Manager',
    resolved_by_manager: 'Manager đã quyết định',
    withdrawn: 'Đã rút khiếu nại',
  },
  feeStatementStatus: {
    draft: 'Bản nháp',
    issued: 'Chưa thanh toán',
    partially_paid: 'Thanh toán một phần',
    paid: 'Đã thanh toán',
    void: 'Đã hủy',
  },
  paymentStatus: {
    recorded: 'Chờ bên kia xác nhận',
    acknowledged: 'Đã xác nhận',
    voided: 'Đã hủy',
  },
  paymentMethod: {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
    e_wallet: 'Ví điện tử',
    online_gateway: 'Cổng thanh toán',
    other: 'Khác',
  },
  violationReportStatus: {
    open: 'Mới',
    linked: 'Đang xử lý',
    closed: 'Đã đóng',
  },
  moderationCaseType: {
    violation: 'Vi phạm',
    session_dispute: 'Tranh chấp buổi học',
    appeal: 'Khiếu nại lại',
  },
  moderationCaseStatus: {
    open: 'Chờ xử lý',
    in_review: 'Đang xem xét',
    resolved: 'Đã xử lý',
    dismissed: 'Không vi phạm',
  },
  moderationDecision: {
    no_action: 'Không xử lý',
    warning: 'Cảnh báo',
    content_hidden: 'Ẩn nội dung',
    account_restricted: 'Hạn chế tài khoản',
    account_locked: 'Khóa tài khoản',
    record_corrected: 'Sửa bản ghi',
  },
  sanctionType: {
    warning: 'Cảnh báo',
    restriction: 'Hạn chế',
    lock: 'Khóa',
  },
} satisfies EnumLabels & Record<string, Record<string, string>>;
