import { describe, expect, it } from '@jest/globals';
import { ZodError } from 'zod';
import { buildStorageKey, createStorage } from './storage.js';

const storage = createStorage({
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET_PUBLIC: 'tps-public',
  S3_BUCKET_PRIVATE: 'tps-private',
  S3_PUBLIC_BASE_URL: undefined,
});

describe('buildStorageKey', () => {
  it('uses purpose/owner/uuid + extension, never the original file name', () => {
    const key = buildStorageKey('avatar', 'user-1', 'image/png');
    expect(key).toMatch(/^avatar\/user-1\/[0-9a-f-]{36}\.png$/);
  });
});

describe('createUploadTicket', () => {
  it('signs content-type and content-length into a private URL for identity documents', async () => {
    const ticket = await storage.createUploadTicket({
      ownerId: 'user-1',
      purpose: 'verification_document',
      fileName: 'CCCD mặt trước.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 123_456,
    });

    expect(ticket.bucket).toBe('private');
    expect(ticket.method).toBe('PUT');
    expect(ticket.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(ticket.storageKey).not.toContain('CCCD');
    const url = new URL(ticket.uploadUrl);
    expect(url.pathname).toMatch(/^\/tps-private\/verification_document\/user-1\//);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    // Không có checksum của body rỗng (lỗi BadDigest của SDK v3 mặc định).
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
  });

  it('refuses a file type the purpose does not allow, before signing anything', async () => {
    await expect(
      storage.createUploadTicket({
        ownerId: 'user-1',
        purpose: 'avatar',
        fileName: 'cv.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1000,
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('refuses a file over the size limit', async () => {
    await expect(
      storage.createUploadTicket({
        ownerId: 'user-1',
        purpose: 'avatar',
        fileName: 'anh.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 50 * 1024 * 1024,
      }),
    ).rejects.toThrow('file_too_large');
  });
});

describe('publicUrl', () => {
  it('points at the public bucket and encodes each path segment', () => {
    expect(storage.publicUrl('avatar/user 1/a.png')).toBe(
      'http://127.0.0.1:1/tps-public/avatar/user%201/a.png',
    );
  });
});
