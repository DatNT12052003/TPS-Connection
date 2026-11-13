// Mã OTP qua email (D54), lưu ở Redis có TTL: 6 chữ số, hiệu lực 10 phút, sai 5 lần thì hủy,
// gửi lại sau 45 giây, tối đa 5 lần mỗi giờ cho một email.
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_RULES } from '@tps/shared';
import type { Redis } from 'ioredis';

export type OtpPurpose = 'verify_email' | 'reset_password';

export type IssueResult =
  | { issued: true; code: string }
  /** Chưa hết 45 giây chờ, hoặc đã gửi đủ 5 lần trong giờ. */
  | { issued: false; retryAfterSeconds: number };

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; attemptsLeft: number }
  /** Không có mã (chưa gửi, đã hết 10 phút, hoặc đã dùng). */
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'attempts_exceeded' };

export interface OtpStore {
  issue(purpose: OtpPurpose, email: string): Promise<IssueResult>;
  verify(purpose: OtpPurpose, email: string, code: string): Promise<VerifyResult>;
}

/** Tăng số lần thử và lấy hash của mã trong một bước (2 lần nhập cùng lúc không được tính 1). */
const ATTEMPT_SCRIPT = `
local hash = redis.call('HGET', KEYS[1], 'hash')
if not hash then return {-1, ''} end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
return {attempts, hash}
`;

export function createRedisOtpStore(options: {
  redis: Redis;
  secret: string;
  rules?: typeof OTP_RULES;
  /** Thay bộ sinh mã trong test. */
  generateCode?: () => string;
}): OtpStore {
  const { redis, secret } = options;
  const rules = options.rules ?? OTP_RULES;
  const generateCode =
    options.generateCode ??
    (() => String(randomInt(0, 10 ** rules.length)).padStart(rules.length, '0'));

  // Khóa Redis không chứa email thô.
  const keys = (purpose: OtpPurpose, email: string) => {
    const id = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32);
    return {
      code: `otp:${purpose}:${id}`,
      cooldown: `otp:${purpose}:${id}:cooldown`,
      hourly: `otp:${purpose}:${id}:hourly`,
    };
  };
  const hmac = (code: string) => createHmac('sha256', secret).update(code).digest('hex');

  return {
    async issue(purpose, email) {
      const key = keys(purpose, email);
      const cooldownSet = await redis.set(
        key.cooldown,
        '1',
        'EX',
        rules.resendCooldownSeconds,
        'NX',
      );
      if (cooldownSet === null) {
        const ttl = await redis.ttl(key.cooldown);
        return { issued: false, retryAfterSeconds: ttl > 0 ? ttl : rules.resendCooldownSeconds };
      }
      const counted = await redis
        .multi()
        .incr(key.hourly)
        .expire(key.hourly, 3600, 'NX')
        .ttl(key.hourly)
        .exec();
      const sentThisHour = Number(counted?.[0]?.[1] ?? 0);
      if (sentThisHour > rules.maxSendsPerHour) {
        const ttl = Number(counted?.[2]?.[1] ?? 3600);
        return { issued: false, retryAfterSeconds: ttl > 0 ? ttl : 3600 };
      }

      const code = generateCode();
      // Mã mới thay mã cũ (D54), đếm lại số lần thử.
      await redis
        .multi()
        .del(key.code)
        .hset(key.code, 'hash', hmac(code), 'attempts', '0')
        .expire(key.code, rules.ttlSeconds)
        .exec();
      return { issued: true, code };
    },

    async verify(purpose, email, code) {
      const key = keys(purpose, email).code;
      const [attempts, storedHash] = (await redis.eval(ATTEMPT_SCRIPT, 1, key)) as [number, string];
      if (attempts < 0) return { ok: false, reason: 'expired' };

      const given = Buffer.from(hmac(code), 'hex');
      const expected = Buffer.from(storedHash, 'hex');
      const matches = given.length === expected.length && timingSafeEqual(given, expected);

      if (matches && attempts <= rules.maxAttempts) {
        await redis.del(key); // dùng một lần
        return { ok: true };
      }
      const attemptsLeft = rules.maxAttempts - attempts;
      if (attemptsLeft <= 0) {
        await redis.del(key);
        return { ok: false, reason: 'attempts_exceeded' };
      }
      return { ok: false, reason: 'invalid', attemptsLeft };
    },
  };
}
