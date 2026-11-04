import argon2 from 'argon2';
import { z } from 'zod';
import { ApiError } from '../http/errors.js';

export const passwordSchema = z.string().min(10).max(128);

export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, { type: argon2.argon2id });

// Verified against when the email is unknown, so both cases take the same time.
const unknownUserHash = hashPassword('placeholder-for-unknown-accounts');

export async function verifyPassword(hash: string | undefined, password: string): Promise<boolean> {
  const matches = await argon2.verify(hash ?? (await unknownUserHash), password);
  return hash !== undefined && matches;
}

// Only entries of 10 or more characters matter: shorter ones already fail the length rule.
const COMMON_PASSWORDS = new Set([
  '0123456789',
  '1234567890',
  '0987654321',
  '9876543210',
  '1111111111',
  '0000000000',
  '1234512345',
  '1122334455',
  '12345678910',
  '123456789a',
  '123456789abc',
  'a123456789',
  'abcd123456',
  'abc1234567',
  'abcdefghij',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'zaq12wsxcde3',
  'asdfghjkl1',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'iloveyou12',
  'iloveyou123',
  'administrator',
  'admin12345',
  'admin123456',
  'welcome123',
  'welcome1234',
  'letmein1234',
  'sunshine123',
  'football123',
  'princess123',
  'matkhau123',
  'matkhau1234',
  'matkhaumoi',
  'anhyeuem123',
  'anhyeuem1234',
  'emyeuanh123',
  'yeuemnhieu',
  'vietnam123',
  'vietnam1234',
  'hanoi12345',
  'saigon12345',
  'tpsconnection',
  'tps-connection',
  'tpsconnection123',
]);

export const isCommonPassword = (password: string): boolean =>
  COMMON_PASSWORDS.has(password.toLowerCase());

export function assertPasswordAllowed(password: string, path: string): void {
  if (isCommonPassword(password)) {
    throw new ApiError(400, 'INVALID_INPUT', 'Invalid input', [
      { path, code: 'PASSWORD_TOO_COMMON' },
    ]);
  }
}
