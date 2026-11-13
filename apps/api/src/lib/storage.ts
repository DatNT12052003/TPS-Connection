// Kho lưu tệp tương thích S3 (SeaweedFS khi local và khi chạy thật, D53). Trình duyệt upload THẲNG lên kho
// bằng presigned URL; API chỉ kiểm tra quy tắc (FILE_RULES) rồi ký URL, không nhận nội dung tệp.
import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  FILE_RULES,
  type FileBucket,
  type FilePurpose,
  UploadRequest,
  type UploadTicket,
} from '@tps/shared';
import type { Env } from '../config/env.js';

export type StorageConfig = Pick<
  Env,
  | 'S3_ENDPOINT'
  | 'S3_REGION'
  | 'S3_ACCESS_KEY'
  | 'S3_SECRET_KEY'
  | 'S3_BUCKET_PUBLIC'
  | 'S3_BUCKET_PRIVATE'
  | 'S3_PUBLIC_BASE_URL'
>;

export interface StoredObject {
  sizeBytes: number;
  contentType: string | undefined;
}

export interface Storage {
  /** Kiểm tra quy tắc (ném ZodError → 422) rồi cấp URL PUT có chữ ký gồm Content-Type và Content-Length. */
  createUploadTicket(input: UploadRequest & { ownerId: string }): Promise<UploadTicket>;
  /** URL đọc tạm thời cho tệp private (mặc định 5 phút). */
  createDownloadUrl(
    bucket: FileBucket,
    storageKey: string,
    options?: { expiresInSeconds?: number; downloadName?: string },
  ): Promise<string>;
  /** URL cố định cho tệp public (ảnh đại diện, ảnh bài đăng). */
  publicUrl(storageKey: string): string;
  /** Thông tin tệp đã upload; null nếu chưa có (dùng để xác nhận upload xong). */
  headObject(bucket: FileBucket, storageKey: string): Promise<StoredObject | null>;
  deleteObject(bucket: FileBucket, storageKey: string): Promise<void>;
  /** Cho phép các origin của web upload/đọc thẳng (CORS của bucket). */
  configureCors(origins: string[]): Promise<void>;
  /** Health check: cả hai bucket truy cập được. */
  ping(): Promise<void>;
  destroy(): void;
}

export const UPLOAD_URL_TTL_SECONDS = 5 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

/**
 * Khóa lưu trữ: <mục đích>/<chủ sở hữu>/<uuid><đuôi>. Không dùng tên tệp gốc (có thể chứa họ tên trẻ,
 * ký tự lạ); tên gốc lưu ở cột `files.original_name`.
 */
export function buildStorageKey(
  purpose: FilePurpose,
  ownerId: string,
  contentType: string,
): string {
  return `${purpose}/${ownerId}/${randomUUID()}${EXTENSIONS[contentType] ?? ''}`;
}

/** Tên tệp an toàn cho header Content-Disposition (RFC 6266 / 5987). */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function createStorage(config: StorageConfig): Storage {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
    // SeaweedFS (và đa số dịch vụ S3 tự host) dùng đường dẫn /<bucket>/<key>.
    forcePathStyle: true,
    // Mặc định SDK v3 nhúng checksum của body RỖNG vào presigned URL, upload thật bị BadDigest.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const bucketName = (bucket: FileBucket) =>
    bucket === 'public' ? config.S3_BUCKET_PUBLIC : config.S3_BUCKET_PRIVATE;

  const publicBase = (
    config.S3_PUBLIC_BASE_URL ??
    `${config.S3_ENDPOINT.replace(/\/$/, '')}/${config.S3_BUCKET_PUBLIC}`
  ).replace(/\/$/, '');

  return {
    async createUploadTicket(input) {
      const request = UploadRequest.parse(input);
      const { bucket } = FILE_RULES[request.purpose];
      const storageKey = buildStorageKey(request.purpose, input.ownerId, request.contentType);
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucketName(bucket),
          Key: storageKey,
          ContentType: request.contentType,
          ContentLength: request.sizeBytes,
        }),
        {
          expiresIn: UPLOAD_URL_TTL_SECONDS,
          // Đưa hai header vào chữ ký: gửi sai loại hoặc sai số byte thì kho lưu trữ trả 403.
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      );
      return {
        bucket,
        storageKey,
        uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': request.contentType },
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
      };
    },

    createDownloadUrl(bucket, storageKey, options = {}) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucketName(bucket),
          Key: storageKey,
          ...(options.downloadName && {
            ResponseContentDisposition: contentDisposition(options.downloadName),
          }),
        }),
        { expiresIn: options.expiresInSeconds ?? DOWNLOAD_URL_TTL_SECONDS },
      );
    },

    publicUrl(storageKey) {
      return `${publicBase}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
    },

    async headObject(bucket, storageKey) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: bucketName(bucket), Key: storageKey }),
        );
        return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
      } catch (err) {
        if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return null;
        throw err;
      }
    },

    async deleteObject(bucket, storageKey) {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: storageKey }));
    },

    async configureCors(origins) {
      const rules = [
        {
          AllowedOrigins: origins,
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedHeaders: ['content-type'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 600,
        },
      ];
      for (const bucket of ['public', 'private'] as const) {
        await client.send(
          new PutBucketCorsCommand({
            Bucket: bucketName(bucket),
            CORSConfiguration: { CORSRules: rules },
          }),
        );
      }
    },

    async ping() {
      await Promise.all(
        (['public', 'private'] as const).map((bucket) =>
          client.send(new HeadBucketCommand({ Bucket: bucketName(bucket) })),
        ),
      );
    },

    destroy() {
      client.destroy();
    },
  };
}
