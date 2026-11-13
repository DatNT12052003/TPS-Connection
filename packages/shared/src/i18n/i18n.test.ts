import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../errors.js';
import { Email, Password } from '../schemas/common.js';
import { LABELLED_ENUMS } from '../statuses.js';
import { messages } from './index.js';

type Tree = { [key: string]: string | Tree };

const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...acc, [path]: value }
      : { ...acc, ...flatten(value, path) };
  }, {});

describe.each(Object.entries(messages))('messages.%s', (_locale, bundle) => {
  const flat = flatten(bundle);

  it.each(Object.entries(LABELLED_ENUMS))('has a label for every %s value', (key, schema) => {
    for (const value of schema.options) {
      expect(flat[`${key}.${value}`], `${key}.${value}`).toBeTruthy();
    }
  });

  it('has a message for every error code', () => {
    for (const code of ErrorCode.options) {
      expect(flat[`errors.${code}`], `errors.${code}`).toBeTruthy();
    }
  });

  it('has no empty strings', () => {
    for (const [path, value] of Object.entries(flat)) {
      expect(value.trim(), path).not.toBe('');
    }
  });
});

describe('vi and en', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(flatten(messages.en as Tree)).sort()).toEqual(
      Object.keys(flatten(messages.vi as Tree)).sort(),
    );
  });
});

describe('validation error codes from shared schemas', () => {
  const codesOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
    result.error?.issues.map((issue) => issue.message) ?? [];

  it('are translated under validation.*', () => {
    const codes = [
      ...codesOf(Password.safeParse('short')),
      ...codesOf(Password.safeParse('onlyletters')),
      ...codesOf(Password.safeParse('x'.repeat(129) + '1')),
      ...codesOf(Email.safeParse('not-an-email')),
    ];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(messages.vi.validation, code).toHaveProperty(code);
    }
  });
});
