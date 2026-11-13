import { describe, expect, it } from 'vitest';
import { FILE_RULES, FilePurpose, UploadRequest } from './files.js';
import { messages } from './i18n/index.js';

const valid = {
  purpose: 'verification_document',
  fileName: 'cccd-mat-truoc.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 2 * 1024 * 1024,
} as const;

describe('FILE_RULES', () => {
  it('covers every purpose', () => {
    expect(Object.keys(FILE_RULES).sort()).toEqual([...FilePurpose.options].sort());
  });

  it('keeps identity documents and credentials private (C4)', () => {
    expect(FILE_RULES.verification_document.bucket).toBe('private');
    expect(FILE_RULES.credential.bucket).toBe('private');
  });
});

describe('UploadRequest', () => {
  it('accepts a file within the rules and normalises the content type', () => {
    expect(UploadRequest.parse({ ...valid, contentType: 'IMAGE/JPEG' }).contentType).toBe(
      'image/jpeg',
    );
  });

  it('rejects a type that the purpose does not allow', () => {
    const result = UploadRequest.safeParse({
      ...valid,
      purpose: 'avatar',
      contentType: 'application/pdf',
    });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['contentType'], message: 'file_type_not_allowed' }),
    ]);
  });

  it('rejects a file over the size limit', () => {
    const result = UploadRequest.safeParse({ ...valid, sizeBytes: 10 * 1024 * 1024 + 1 });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['sizeBytes'], message: 'file_too_large' }),
    ]);
  });

  it('uses validation codes that have translations', () => {
    for (const code of ['file_type_not_allowed', 'file_too_large'] as const) {
      expect(messages.vi.validation[code]).toBeTruthy();
      expect(messages.en.validation[code]).toBeTruthy();
    }
  });
});
