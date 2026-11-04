import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { BUCKETS, type FileStore, type ObjectRef } from '../../files/file-store.js';
import { ApiError } from '../../http/errors.js';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const AVATAR_FORMATS = new Set(['jpeg', 'png', 'webp']);
const AVATAR_PIXELS = 512;

const UPLOAD_URL_SECONDS = 5 * 60;
const AVATAR_URL_SECONDS = 15 * 60;

type FileRow = {
  id: string;
  bucket: string;
  object_key: string;
  completed_at: Date | null;
};

const refOf = (row: { bucket: string; object_key: string }): ObjectRef => ({
  bucket: row.bucket,
  key: row.object_key,
});

const fileInvalid = (code: string) => new ApiError(422, code, 'File was refused');

/**
 * Decodes the whole image, so a renamed file or a real header on broken data
 * fails here. Encoding again keeps only pixels: location and camera metadata in
 * a phone photo never reach anyone viewing the profile. SVG is refused because
 * it can hold scripts.
 */
async function normalizeAvatar(original: Buffer): Promise<Buffer> {
  try {
    const { format } = await sharp(original).metadata();
    if (!AVATAR_FORMATS.has(format)) throw new Error('Unsupported format');
    return await sharp(original, { failOn: 'error' })
      .rotate()
      .resize(AVATAR_PIXELS, AVATAR_PIXELS, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw fileInvalid('FILE_NOT_A_VALID_IMAGE');
  }
}

export const filesService = (db: DataSource, store: FileStore) => ({
  async createAvatarUpload(
    ownerId: string,
    upload: { mimeType: string; sizeBytes: number },
  ): Promise<{ id: string; uploadUrl: string; uploadHeaders: Record<string, string> }> {
    const id = uuidv7();
    const ref = { bucket: BUCKETS.files, key: `avatars/${ownerId}/${id}` };
    await db.query(
      `INSERT INTO files (id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes)
       VALUES ($1, $2, 'avatar', $3, $4, $5, $6)`,
      [id, ownerId, ref.bucket, ref.key, upload.mimeType, upload.sizeBytes],
    );
    return {
      id,
      uploadUrl: await store.signUpload(ref, upload, UPLOAD_URL_SECONDS),
      uploadHeaders: {
        'Content-Type': upload.mimeType,
        'Content-Length': String(upload.sizeBytes),
      },
    };
  },

  /** Safe to repeat. A refused file is marked for removal and cannot be completed later. */
  async completeUpload(fileId: string): Promise<void> {
    const rows: FileRow[] = await db.query(
      `SELECT id, bucket, object_key, completed_at FROM files
        WHERE id = $1 AND deleted_at IS NULL`,
      [fileId],
    );
    const file = rows[0];
    if (!file) throw fileInvalid('FILE_NOT_A_VALID_IMAGE');
    if (file.completed_at) return;

    const refuse = async (code: string) => {
      await db.query(`UPDATE files SET deleted_at = now(), updated_at = now() WHERE id = $1`, [
        fileId,
      ]);
      return fileInvalid(code);
    };

    const ref = refOf(file);
    const size = await store.sizeOf(ref);
    // Not refused for good: the upload may simply not have happened yet.
    if (size === undefined) throw fileInvalid('FILE_NOT_UPLOADED');
    if (size > AVATAR_MAX_BYTES) throw await refuse('FILE_TOO_LARGE');

    let normalized: Buffer;
    try {
      normalized = await normalizeAvatar(await store.read(ref));
    } catch (error) {
      if (error instanceof ApiError) throw await refuse(error.code);
      throw error;
    }
    await store.write(ref, normalized, 'image/webp');
    await db.query(
      `UPDATE files SET completed_at = now(), mime_type = 'image/webp', size_bytes = $2,
              updated_at = now()
        WHERE id = $1`,
      [fileId, normalized.length],
    );
  },

  async avatarUrl(fileId: string | null): Promise<string | null> {
    if (!fileId) return null;
    const rows: FileRow[] = await db.query(
      `SELECT id, bucket, object_key, completed_at FROM files
        WHERE id = $1 AND deleted_at IS NULL AND completed_at IS NOT NULL`,
      [fileId],
    );
    return rows[0] ? store.signDownload(refOf(rows[0]), AVATAR_URL_SECONDS) : null;
  },
});
