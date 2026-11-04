export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

export const isLocale = (value: string | undefined): value is Locale =>
  LOCALES.includes(value as Locale);

const vi = {
  'meta.title': 'TPS-Connection: Kết nối gia sư, phụ huynh và học sinh',
  'meta.description': 'Tìm gia sư phù hợp và theo dõi việc học trên cùng một nền tảng.',
  'home.heading': 'Kết nối gia sư, phụ huynh và học sinh',
  'home.subjects': 'Các môn học',
  'home.subjectsEmpty': 'Chưa có môn học nào.',
  'language.switch': 'English',
  'error.title': 'Đã có lỗi xảy ra',
  'error.notFound': 'Không tìm thấy trang này.',
  'error.unavailable': 'Hệ thống tạm thời chưa sẵn sàng. Vui lòng thử lại sau.',

  'form.pending': 'Đang xử lý…',
  'field.email': 'Email',
  'field.password': 'Mật khẩu',
  'field.newPassword': 'Mật khẩu mới',
  'field.displayName': 'Tên hiển thị',
  'field.passwordHint': 'Ít nhất 10 ký tự.',

  'nav.login': 'Đăng nhập',
  'nav.register': 'Đăng ký',
  'nav.account': 'Tài khoản',

  'register.title': 'Đăng ký',
  'register.role': 'Bạn là',
  'register.roleParent': 'Phụ huynh',
  'register.roleTutor': 'Gia sư',
  'register.terms': 'Tôi đồng ý với điều khoản sử dụng và chính sách quyền riêng tư.',
  'register.submit': 'Tạo tài khoản',
  'register.done': 'Kiểm tra email của bạn',
  'register.doneBody':
    'Nếu email này có thể đăng ký, chúng tôi đã gửi liên kết xác thực hoặc hướng dẫn tiếp theo tới hộp thư của bạn.',
  'register.haveAccount': 'Đã có tài khoản?',

  'login.title': 'Đăng nhập',
  'login.submit': 'Đăng nhập',
  'login.forgot': 'Quên mật khẩu?',
  'login.noAccount': 'Chưa có tài khoản?',

  'verify.title': 'Xác thực email',
  'verify.intro': 'Bấm nút dưới đây để hoàn tất xác thực email của bạn.',
  'verify.submit': 'Xác thực email',
  'verify.done': 'Email của bạn đã được xác thực.',
  'verify.continue': 'Tiếp tục',
  'verify.invalid': 'Liên kết không hợp lệ, đã hết hạn hoặc đã được dùng.',
  'verify.resendIntro': 'Nhập email để nhận liên kết mới.',
  'verify.resend': 'Gửi lại liên kết',
  'verify.resent': 'Nếu email này chưa được xác thực, chúng tôi đã gửi một liên kết mới.',

  'forgot.title': 'Quên mật khẩu',
  'forgot.intro': 'Nhập email tài khoản để nhận liên kết đặt lại mật khẩu.',
  'forgot.submit': 'Gửi liên kết',
  'forgot.done': 'Nếu email này có tài khoản, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.',

  'reset.title': 'Đặt mật khẩu mới',
  'reset.submit': 'Đổi mật khẩu',
  'reset.done': 'Mật khẩu đã được đổi. Mọi phiên đăng nhập cũ đã bị đăng xuất.',
  'reset.invalid': 'Liên kết không hợp lệ, đã hết hạn hoặc đã được dùng.',
  'reset.requestAgain': 'Yêu cầu liên kết mới',

  'account.title': 'Tài khoản của bạn',
  'account.unverified': 'Email của bạn chưa được xác thực. Hãy mở liên kết chúng tôi đã gửi.',
  'account.greeting': 'Xin chào',
  'account.logout': 'Đăng xuất',

  'code.INVALID_CREDENTIALS': 'Email hoặc mật khẩu không đúng.',
  'code.LOGIN_TEMPORARILY_BLOCKED':
    'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút hoặc đặt lại mật khẩu.',
  'code.ACCOUNT_LOCKED': 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ.',
  'code.TOO_MANY_REQUESTS': 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.',
  'code.DEFAULT': 'Không thực hiện được. Vui lòng thử lại.',

  'fieldError.email': 'Email không hợp lệ.',
  'fieldError.password': 'Mật khẩu cần có từ 10 đến 128 ký tự.',
  'fieldError.passwordCommon': 'Mật khẩu này quá phổ biến. Hãy chọn mật khẩu khác.',
  'fieldError.displayName': 'Hãy nhập tên hiển thị, tối đa 100 ký tự.',
  'fieldError.role': 'Hãy chọn vai trò của bạn.',
  'fieldError.terms': 'Bạn cần đồng ý để tạo tài khoản.',
  'fieldError.required': 'Trường này chưa hợp lệ.',
};

export type MessageKey = keyof typeof vi;

const en: Record<MessageKey, string> = {
  'meta.title': 'TPS-Connection: Connecting tutors, parents and students',
  'meta.description': 'Find the right tutor and follow learning progress on one platform.',
  'home.heading': 'Connecting tutors, parents and students',
  'home.subjects': 'Subjects',
  'home.subjectsEmpty': 'No subjects yet.',
  'language.switch': 'Tiếng Việt',
  'error.title': 'Something went wrong',
  'error.notFound': 'This page could not be found.',
  'error.unavailable': 'The system is temporarily unavailable. Please try again later.',

  'form.pending': 'Working…',
  'field.email': 'Email',
  'field.password': 'Password',
  'field.newPassword': 'New password',
  'field.displayName': 'Display name',
  'field.passwordHint': 'At least 10 characters.',

  'nav.login': 'Sign in',
  'nav.register': 'Sign up',
  'nav.account': 'Account',

  'register.title': 'Sign up',
  'register.role': 'I am a',
  'register.roleParent': 'Parent',
  'register.roleTutor': 'Tutor',
  'register.terms': 'I agree to the terms of service and the privacy policy.',
  'register.submit': 'Create account',
  'register.done': 'Check your email',
  'register.doneBody':
    'If this email can be registered, we have sent a verification link or next steps to your inbox.',
  'register.haveAccount': 'Already have an account?',

  'login.title': 'Sign in',
  'login.submit': 'Sign in',
  'login.forgot': 'Forgot your password?',
  'login.noAccount': 'No account yet?',

  'verify.title': 'Verify your email',
  'verify.intro': 'Press the button below to finish verifying your email.',
  'verify.submit': 'Verify email',
  'verify.done': 'Your email has been verified.',
  'verify.continue': 'Continue',
  'verify.invalid': 'This link is invalid, has expired or has already been used.',
  'verify.resendIntro': 'Enter your email to get a new link.',
  'verify.resend': 'Send a new link',
  'verify.resent': 'If this email is not verified yet, we have sent a new link.',

  'forgot.title': 'Forgot your password',
  'forgot.intro': 'Enter your account email to get a password reset link.',
  'forgot.submit': 'Send link',
  'forgot.done': 'If this email has an account, we have sent instructions to reset the password.',

  'reset.title': 'Choose a new password',
  'reset.submit': 'Change password',
  'reset.done': 'Your password has been changed. All earlier sessions were signed out.',
  'reset.invalid': 'This link is invalid, has expired or has already been used.',
  'reset.requestAgain': 'Request a new link',

  'account.title': 'Your account',
  'account.unverified': 'Your email is not verified yet. Please open the link we sent you.',
  'account.greeting': 'Hello',
  'account.logout': 'Sign out',

  'code.INVALID_CREDENTIALS': 'The email or password is incorrect.',
  'code.LOGIN_TEMPORARILY_BLOCKED':
    'Too many incorrect attempts. Please try again in a few minutes or reset your password.',
  'code.ACCOUNT_LOCKED': 'Your account has been locked. Please contact support.',
  'code.TOO_MANY_REQUESTS': 'Too many requests. Please try again later.',
  'code.DEFAULT': 'That did not work. Please try again.',

  'fieldError.email': 'This email is not valid.',
  'fieldError.password': 'The password must be 10 to 128 characters long.',
  'fieldError.passwordCommon': 'This password is too common. Please choose another.',
  'fieldError.displayName': 'Enter a display name of up to 100 characters.',
  'fieldError.role': 'Choose your role.',
  'fieldError.terms': 'You need to agree in order to create an account.',
  'fieldError.required': 'This field is not valid.',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { vi, en };

export const translate = (locale: Locale, key: MessageKey): string => MESSAGES[locale][key];
