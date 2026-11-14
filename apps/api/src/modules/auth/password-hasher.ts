import * as argon2 from 'argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /**
   * So mật khẩu với hash. `hash` null (không có tài khoản, hoặc tài khoản chưa đặt mật khẩu) vẫn tốn
   * cùng thời gian như khi so thật, để không dò được email nào đã đăng ký qua thời gian phản hồi.
   */
  verify(hash: string | null, password: string): Promise<boolean>;
}

/** argon2id theo khuyến nghị tối thiểu của OWASP: 19 MiB bộ nhớ, 2 vòng, 1 luồng (~35 ms mỗi lần). */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function createArgon2Hasher(
  options: { memoryCost?: number; timeCost?: number; parallelism?: number } = {},
): PasswordHasher {
  const params = { ...ARGON2_OPTIONS, ...options };
  let dummyHash: Promise<string> | undefined;

  return {
    hash: (password) => argon2.hash(password, params),
    async verify(hash, password) {
      if (!hash) {
        dummyHash ??= argon2.hash('dummy-password-for-timing', params);
        await argon2.verify(await dummyHash, password);
        return false;
      }
      try {
        return await argon2.verify(hash, password);
      } catch {
        // Hash hỏng hoặc sai định dạng: coi như sai mật khẩu.
        return false;
      }
    },
  };
}
