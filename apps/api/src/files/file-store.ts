import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env.js';

/** Every bucket is private. Objects are reached only through signed URLs (NFR-S07). */
export const BUCKETS = { files: 'tps-files', verification: 'tps-verification' } as const;

export type ObjectRef = { bucket: string; key: string };

export type FileStore = {
  signUpload(
    ref: ObjectRef,
    upload: { mimeType: string; sizeBytes: number },
    expiresInSeconds: number,
  ): Promise<string>;
  signDownload(ref: ObjectRef, expiresInSeconds: number): Promise<string>;
  /** Answers undefined when the object does not exist. */
  sizeOf(ref: ObjectRef): Promise<number | undefined>;
  read(ref: ObjectRef): Promise<Buffer>;
  write(ref: ObjectRef, body: Buffer, mimeType: string): Promise<void>;
  remove(ref: ObjectRef): Promise<void>;
  ensureBuckets(): Promise<void>;
};

export type S3Settings = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function s3SettingsFromEnv(env: Env): S3Settings {
  if (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY are required');
  }
  return {
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  };
}

const isMissing = (error: unknown) => {
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === 'NotFound' || name === 'NoSuchKey' || $metadata?.httpStatusCode === 404;
};

export function s3FileStore(settings: S3Settings): FileStore {
  const client = new S3Client({
    endpoint: settings.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    // Otherwise signed URLs demand a checksum that browsers and plain clients do not send.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return {
    signUpload: (ref, upload, expiresIn) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: ref.bucket,
          Key: ref.key,
          ContentType: upload.mimeType,
          ContentLength: upload.sizeBytes,
        }),
        // Signing the length makes the store itself refuse a larger upload.
        { expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
      ),

    signDownload: (ref, expiresIn) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }), {
        expiresIn,
      }),

    sizeOf: async (ref) => {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
        return head.ContentLength;
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },

    read: async (ref) => {
      const object = await client.send(new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
      if (!object.Body) throw new Error('Object has no body');
      return Buffer.from(await object.Body.transformToByteArray());
    },

    write: async (ref, body, mimeType) => {
      await client.send(
        new PutObjectCommand({
          Bucket: ref.bucket,
          Key: ref.key,
          Body: body,
          ContentType: mimeType,
        }),
      );
    },

    remove: async (ref) => {
      await client.send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
    },

    ensureBuckets: async () => {
      for (const bucket of Object.values(BUCKETS)) {
        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (error) {
          if (!isMissing(error)) throw error;
          await client.send(new CreateBucketCommand({ Bucket: bucket }));
        }
      }
    },
  };
}
