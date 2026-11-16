import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  // Khu công khai: SSR cho SEO.
  layout('routes/public/layout.tsx', [
    index('routes/public/home.tsx'),
    // Marketplace (G4): tìm gia sư, hồ sơ gia sư, bài tuyển học sinh. Đường dẫn là slug (D56).
    route('tutors', 'routes/public/tutors/search.tsx'),
    route('tutors/:tutorRef', 'routes/public/tutors/detail.tsx'),
    route('tutor-posts', 'routes/public/posts/search.tsx'),
    route('tutor-posts/:postRef', 'routes/public/posts/detail.tsx'),
    route('status', 'routes/public/status.tsx'),
    route('*', 'routes/public/not-found.tsx'),
  ]),

  // Tài khoản (D54, D57): mỗi trang tự dựng bố cục riêng theo canvas.
  route('login', 'routes/auth/login.tsx'),
  route('register', 'routes/auth/register.tsx'),
  route('verify-email', 'routes/auth/verify-email.tsx'),
  route('forgot-password', 'routes/auth/forgot-password.tsx'),
  // Con nhận lời mời của phụ huynh (token sau `#`, D50).
  route('student-invitation', 'routes/auth/student-invitation.tsx'),

  // Khu người dùng đã đăng nhập: gia sư, phụ huynh, học sinh.
  route('app', 'routes/app/layout.tsx', [
    index('routes/app/home.tsx'),
    // Phụ huynh: hồ sơ con, mời con tạo tài khoản.
    route('children/new', 'routes/app/children/new.tsx'),
    route('children/:learnerId', 'routes/app/children/detail.tsx'),
    route('children/:learnerId/invite', 'routes/app/children/invite.tsx'),
    // Gia sư: hồ sơ và xác minh, bằng cấp; sửa hồ sơ.
    route('profile', 'routes/app/profile/index.tsx'),
    route('profile/edit', 'routes/app/profile/edit.tsx'),
    // Xin URL tải giấy tờ xác minh (chỉ action, trả JSON).
    route('profile/documents/ticket', 'routes/app/profile/document-ticket.ts'),
    // Tài khoản và cài đặt (mọi vai trò); đổi ảnh đại diện (chỉ action, trả JSON).
    route('account', 'routes/app/account.tsx'),
    route('account/avatar', 'routes/app/account-avatar.ts'),
    // Kết nối, nhắn tin, thông báo (G5).
    route('connections', 'routes/app/connections/index.tsx'),
    route('connections/new', 'routes/app/connections/new.tsx'),
    route('connections/:requestId', 'routes/app/connections/detail.tsx'),
    route('messages', 'routes/app/messages/index.tsx'),
    route('messages/:conversationId', 'routes/app/messages/detail.tsx'),
    // Xin URL tải tệp đính kèm tin nhắn; mở tệp đính kèm (chuyển hướng tới URL tạm của kho).
    route('messages/attachments/ticket', 'routes/app/messages/attachment-ticket.ts'),
    route('messages/:conversationId/attachments/:fileId', 'routes/app/messages/attachment.ts'),
    route('notifications', 'routes/app/notifications.tsx'),
    // Làm mới phiên cho kết nối realtime (chỉ loader).
    route('realtime/session', 'routes/app/realtime-session.ts'),
    // Bài đăng (G4). Gia sư: bài tuyển học sinh, tìm học sinh. Phụ huynh: bài tìm gia sư.
    route('posts', 'routes/app/posts/index.tsx'),
    route('posts/new', 'routes/app/posts/new.tsx'),
    route('posts/:postId/edit', 'routes/app/posts/edit.tsx'),
    route('find-students', 'routes/app/find-students.tsx'),
    route('requests', 'routes/app/requests/index.tsx'),
    route('requests/new', 'routes/app/requests/new.tsx'),
    route('requests/:postId/edit', 'routes/app/requests/edit.tsx'),
    route('*', 'routes/app/not-found.tsx'),
  ]),

  // Khu Manager / Admin.
  route('admin', 'routes/admin/layout.tsx', [
    index('routes/admin/home.tsx'),
    // Manager: hàng chờ xác minh (layout) và màn duyệt một yêu cầu.
    route('verifications', 'routes/admin/verifications/queue.tsx', [
      index('routes/admin/verifications/index.tsx'),
      route(':requestId', 'routes/admin/verifications/detail.tsx'),
    ]),
    // Admin: tài khoản (danh sách là layout của chi tiết) và danh mục.
    route('accounts', 'routes/admin/accounts/list.tsx', [
      index('routes/admin/accounts/index.tsx'),
      route(':userId', 'routes/admin/accounts/detail.tsx'),
    ]),
    route('catalog', 'routes/admin/catalog/index.tsx'),
    route('*', 'routes/admin/not-found.tsx'),
  ]),

  // Route chỉ có action (không có giao diện).
  route('preferences', 'routes/preferences.ts'),
  route('logout', 'routes/auth/logout.ts'),
  // Route chỉ có dữ liệu: xã của một tỉnh, cho ô chọn xã/phường.
  route('catalog/provinces/:provinceId/communes', 'routes/catalog/communes.ts'),
] satisfies RouteConfig;
