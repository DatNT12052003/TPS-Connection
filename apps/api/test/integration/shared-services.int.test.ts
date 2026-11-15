// Test tích hợp cho dịch vụ dùng chung, chạy với SeaweedFS, Mailpit và Redis thật (Testcontainers),
// cùng image và cấu hình quyền S3 như compose.yaml.
import { resolve } from 'node:path';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { createJobs, type Jobs } from '../../src/jobs/index.js';
import { createSmtpEmailSender } from '../../src/lib/email/smtp-email-sender.js';
import type { EmailSender } from '../../src/lib/email/email-sender.js';
import { createStorage, type Storage } from '../../src/lib/storage.js';
import { silentLogger } from '../helpers.js';

jest.setTimeout(180_000);

const ACCESS_KEY = 'tps_dev_access_key';
const SECRET_KEY = 'tps_dev_secret_key_change_me';
const WEB_ORIGIN = 'http://localhost:5173';

let seaweed: StartedTestContainer;
let mailpit: StartedTestContainer;
let redisContainer: StartedRedisContainer;
let storage: Storage;
let s3Endpoint: string;
let mailpitApi: string;

beforeAll(async () => {
  [seaweed, mailpit, redisContainer] = await Promise.all([
    new GenericContainer('chrislusf/seaweedfs:4.53')
      .withCommand([
        'server',
        '-dir=/data',
        '-ip.bind=0.0.0.0',
        '-master.volumeSizeLimitMB=64',
        '-volume.max=0',
        '-s3',
        '-s3.port=8333',
        '-s3.config=/etc/seaweedfs/s3.json',
      ])
      .withCopyFilesToContainer([
        // Jest chạy trong apps/api; dùng đúng tệp quyền S3 của compose.yaml.
        {
          source: resolve(process.cwd(), '../../docker/seaweedfs/s3.json'),
          target: '/etc/seaweedfs/s3.json',
        },
      ])
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forHttp('/healthz', 8333).forStatusCode(200))
      .start(),
    new GenericContainer('axllent/mailpit:v1.33.1')
      .withEnvironment({ MP_SMTP_AUTH_ACCEPT_ANY: '1', MP_SMTP_AUTH_ALLOW_INSECURE: '1' })
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp('/readyz', 8025).forStatusCode(200))
      .start(),
    new RedisContainer('redis:8.10.3-alpine').start(),
  ]);

  s3Endpoint = `http://${seaweed.getHost()}:${seaweed.getMappedPort(8333)}`;
  mailpitApi = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1`;

  // Tạo bucket như docker/seaweedfs/create-buckets.sh.
  const admin = new S3Client({
    endpoint: s3Endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });
  for (const bucket of ['tps-public', 'tps-private']) {
    await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  admin.destroy();

  storage = createStorage({
    S3_ENDPOINT: s3Endpoint,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: ACCESS_KEY,
    S3_SECRET_KEY: SECRET_KEY,
    S3_BUCKET_PUBLIC: 'tps-public',
    S3_BUCKET_PRIVATE: 'tps-private',
    S3_PUBLIC_BASE_URL: undefined,
  });
  await storage.configureCors([WEB_ORIGIN]);
});

afterAll(async () => {
  storage?.destroy();
  await Promise.allSettled([seaweed?.stop(), mailpit?.stop(), redisContainer?.stop()]);
});

describe('storage (SeaweedFS)', () => {
  const pdf = Buffer.from('%PDF-1.7 giấy tờ thử nghiệm');

  it('passes the health ping when both buckets exist', async () => {
    await expect(storage.ping()).resolves.toBeUndefined();
  });

  it('uploads a private document through the presigned URL and reads it back', async () => {
    const ticket = await storage.createUploadTicket({
      ownerId: 'tutor-1',
      purpose: 'verification_document',
      fileName: 'cccd.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
    });

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.headers,
      body: pdf,
    });
    expect(put.status).toBe(200);

    await expect(storage.headObject('private', ticket.storageKey)).resolves.toEqual({
      sizeBytes: pdf.length,
      contentType: 'application/pdf',
    });

    const downloadUrl = await storage.createDownloadUrl('private', ticket.storageKey, {
      downloadName: 'CCCD mặt trước.pdf',
    });
    const get = await fetch(downloadUrl);
    expect(get.status).toBe(200);
    expect(Buffer.from(await get.arrayBuffer())).toEqual(pdf);

    // Không có chữ ký thì không đọc được tệp private.
    const anonymous = await fetch(`${s3Endpoint}/tps-private/${ticket.storageKey}`);
    expect(anonymous.status).toBe(403);

    await storage.deleteObject('private', ticket.storageKey);
    await expect(storage.headObject('private', ticket.storageKey)).resolves.toBeNull();
  });

  it('rejects a body larger than declared or with another content type', async () => {
    const ticket = await storage.createUploadTicket({
      ownerId: 'tutor-1',
      purpose: 'credential',
      fileName: 'bang.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
    });

    const bigger = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.headers,
      body: Buffer.concat([pdf, Buffer.from('thêm')]),
    });
    expect(bigger.status).toBe(403);

    const otherType = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: pdf,
    });
    expect(otherType.status).toBe(403);

    await expect(storage.headObject('private', ticket.storageKey)).resolves.toBeNull();
  });

  it('serves public files (avatars) without a signature', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ticket = await storage.createUploadTicket({
      ownerId: 'parent-1',
      purpose: 'avatar',
      fileName: 'anh.png',
      contentType: 'image/png',
      sizeBytes: png.length,
    });
    expect(ticket.bucket).toBe('public');
    await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: png });

    const get = await fetch(storage.publicUrl(ticket.storageKey));
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('image/png');
  });

  it('allows the web origin to upload from the browser (CORS)', async () => {
    const preflight = (origin: string) =>
      fetch(`${s3Endpoint}/tps-private/any-key`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
    const allowed = await preflight(WEB_ORIGIN);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    const other = await preflight('https://evil.example');
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('email through the BullMQ queue (Mailpit)', () => {
  let sender: EmailSender;
  let jobs: Jobs;

  beforeAll(() => {
    sender = createSmtpEmailSender({
      SMTP_HOST: mailpit.getHost(),
      SMTP_PORT: mailpit.getMappedPort(1025),
      SMTP_SECURE: false,
      SMTP_USER: 'dev',
      SMTP_PASS: 'dev',
      EMAIL_FROM: 'TPS-Connection <no-reply@tps-connection.local>',
    });
    jobs = createJobs({
      redisUrl: redisContainer.getConnectionUrl(),
      emailSender: sender,
      logger: silentLogger,
      workersEnabled: true,
      maintenance: {
        'purge-verification-documents': async () => 0,
        'cleanup-stale-uploads': async () => 0,
      },
    });
  });

  afterAll(async () => {
    await jobs?.close();
    sender?.close();
  });

  it('verifies the SMTP connection', async () => {
    await expect(sender.verify()).resolves.toBeUndefined();
  });

  it('delivers a queued email with Vietnamese text intact', async () => {
    const subject = 'Xác thực email của bạn – TPS-Connection';
    const { jobId } = await jobs.enqueueEmail({
      to: 'phuhuynh@example.com',
      subject,
      text: 'Chào bạn, bấm liên kết sau để xác thực email.',
      html: '<p>Chào bạn, bấm liên kết sau để xác thực email.</p>',
    });
    expect(jobId).toBeTruthy();

    const message = await waitFor(async () => {
      const list = (await (await fetch(`${mailpitApi}/messages`)).json()) as {
        messages: { ID: string; Subject: string; To: { Address: string }[] }[];
      };
      return list.messages.find((m) => m.Subject === subject);
    });
    expect(message.To.map((t) => t.Address)).toEqual(['phuhuynh@example.com']);

    const detail = (await (await fetch(`${mailpitApi}/message/${message.ID}`)).json()) as {
      Text: string;
      From: { Address: string };
    };
    expect(detail.Text).toContain('Chào bạn, bấm liên kết sau để xác thực email.');
    expect(detail.From.Address).toBe('no-reply@tps-connection.local');

    const job = await jobs.emailQueue.getJob(jobId);
    expect(await job?.getState()).toBe('completed');
  });

  it('fails an invalid job once instead of retrying it', async () => {
    const job = await jobs.emailQueue.add('send', {
      to: 'not-an-email',
      subject: 'x',
      text: 'x',
    });
    const state = await waitFor(async () => {
      const current = await job.getState();
      return current === 'failed' ? current : undefined;
    });
    expect(state).toBe('failed');
    const failed = await jobs.emailQueue.getJob(job.id!);
    expect(failed?.attemptsMade).toBe(1);
  });
});

/** Chờ tới khi `probe` trả về giá trị (tối đa 15 giây). */
async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('waitFor timed out');
}
