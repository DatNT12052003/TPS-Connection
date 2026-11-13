// Mục điều hướng theo khu vực và vai trò, đúng thứ tự trên canvas giao diện MVP đã duyệt (D52).
// desktop: thanh trên (từ 1024 px). mobile: thanh dưới đáy (dưới 1024 px, D51), tối đa 5 mục, nhãn ngắn.
import type { ParseKeys } from 'i18next';
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileText,
  Flag,
  FolderCog,
  Gavel,
  History,
  Home,
  type LucideIcon,
  MessageSquare,
  Scale,
  Search,
  Star,
  User,
  Users,
} from 'lucide-react';

export type NavLabelKey = Extract<ParseKeys, `nav.${string}`>;

export interface NavItem {
  to: string;
  label: NavLabelKey;
  icon: LucideIcon;
  /** Chỉ sáng khi khớp đúng đường dẫn (trang tổng quan), không sáng cho trang con. */
  end?: boolean;
}

export interface NavConfig {
  desktop: NavItem[];
  mobile: NavItem[];
}

export const MOBILE_NAV_MAX = 5;

export const PATHS = {
  home: '/',
  findTutors: '/tutors',
  tutorPosts: '/tutor-posts',
  forTutors: '/for-tutors',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  logout: '/logout',
  terms: '/terms',
  privacy: '/privacy',
  contact: '/contact',
  status: '/status',
  app: '/app',
  admin: '/admin',
  notifications: '/app/notifications',
} as const;

export const PUBLIC_NAV: NavItem[] = [
  { to: PATHS.findTutors, label: 'nav.findTutors', icon: Search },
  { to: PATHS.tutorPosts, label: 'nav.tutorPosts', icon: FileText },
  { to: PATHS.forTutors, label: 'nav.forTutors', icon: BookOpen },
];

export type AppRole = 'tutor' | 'parent' | 'student';
export type StaffRole = 'manager' | 'admin';

export const APP_ROLES = ['tutor', 'parent', 'student'] as const satisfies readonly AppRole[];
export const STAFF_ROLES = ['manager', 'admin'] as const satisfies readonly StaffRole[];

const item = (to: string, label: NavLabelKey, icon: LucideIcon, end?: boolean): NavItem => ({
  to,
  label,
  icon,
  ...(end && { end }),
});

export const APP_NAV: Record<AppRole, NavConfig> = {
  tutor: {
    desktop: [
      item('/app', 'nav.overview', Home, true),
      item('/app/schedule', 'nav.teachSchedule', Calendar),
      item('/app/classes', 'nav.classes', BookOpen),
      item('/app/connections', 'nav.connections', MessageSquare),
      item('/app/posts', 'nav.posts', FileText),
      item('/app/find-students', 'nav.findStudents', Search),
    ],
    mobile: [
      item('/app', 'nav.overview', Home, true),
      item('/app/schedule', 'nav.teachSchedule', Calendar),
      item('/app/connections', 'nav.connectionsShort', MessageSquare),
      item('/app/classes', 'nav.classes', BookOpen),
      item('/app/profile', 'nav.profile', User),
    ],
  },
  parent: {
    desktop: [
      item('/app', 'nav.home', Home, true),
      item(PATHS.findTutors, 'nav.findTutors', Search),
      item('/app/connections', 'nav.connections', MessageSquare),
      item('/app/classes', 'nav.classes', BookOpen),
      item('/app/fees', 'nav.fees', FileText),
    ],
    mobile: [
      item('/app', 'nav.home', Home, true),
      item(PATHS.findTutors, 'nav.findTutors', Search),
      item('/app/connections', 'nav.connectionsShort', MessageSquare),
      item('/app/classes', 'nav.classes', BookOpen),
      item('/app/account', 'nav.account', User),
    ],
  },
  student: {
    desktop: [
      item('/app', 'nav.home', Home, true),
      item('/app/schedule', 'nav.learnSchedule', Calendar),
      item('/app/grades', 'nav.grades', Star),
    ],
    mobile: [
      item('/app', 'nav.home', Home, true),
      item('/app/schedule', 'nav.learnSchedule', Calendar),
      item('/app/grades', 'nav.gradesShort', Star),
    ],
  },
};

/** Khu vực quản trị: điện thoại dùng menu mở ra (không có thanh dưới đáy), nên chỉ một danh sách. */
export const ADMIN_NAV: Record<StaffRole, NavItem[]> = {
  manager: [
    item('/admin/verifications', 'nav.verifications', ClipboardCheck),
    item('/admin/reports', 'nav.reports', Flag),
    item('/admin/disputes', 'nav.disputes', Scale),
    item('/admin/posts', 'nav.moderatePosts', FileText),
  ],
  admin: [
    item('/admin/accounts', 'nav.accounts', Users),
    item('/admin/catalog', 'nav.catalog', FolderCog),
    item('/admin/appeals', 'nav.appeals', Gavel),
    item('/admin/audit-log', 'nav.auditLog', History),
  ],
};
