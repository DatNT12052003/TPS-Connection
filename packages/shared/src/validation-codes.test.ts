// Mọi mã lỗi tự đặt trong schema (`{ error: 'xxx' }`, `message: 'xxx'`) phải là khóa của `validation.*` trong
// i18n: API trả mã đó ở `details[].code`, web hiển thị `t('validation.<code>')`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isValidationCode } from './i18n/index.js';

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const schemaFiles = [
  ...readdirSync(join(srcDir, 'schemas'))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(srcDir, 'schemas', name)),
  join(srcDir, 'files.ts'),
];

function customCodes(): string[] {
  const codes = new Set<string>();
  for (const file of schemaFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:error|message): '([a-z_]+)'/g)) {
      codes.add(match[1]!);
    }
  }
  return [...codes].sort();
}

describe('validation codes', () => {
  it('finds the custom codes used in schemas', () => {
    expect(customCodes()).toEqual(expect.arrayContaining(['required', 'too_long', 'slot_overlap']));
  });

  it('every custom code in a schema has a validation.* message', () => {
    expect(customCodes().filter((code) => !isValidationCode(code))).toEqual([]);
  });

  it('has the fallback code', () => {
    expect(isValidationCode('invalid')).toBe(true);
    expect(isValidationCode('no_such_code')).toBe(false);
  });
});
