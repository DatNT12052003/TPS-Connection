import type { DataSource } from 'typeorm';
import { z } from 'zod';
import type { FileStore } from '../../files/file-store.js';
import { defineRoute } from '../../http/route.js';
import { fileOwner } from '../../policies/files.policy.js';
import { ownAccount } from '../../policies/policy.js';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, filesService } from './files.service.js';

const idParams = z.object({ id: z.uuid() });

export const filesRoutes = (db: DataSource, store: FileStore) => {
  const service = filesService(db, store);
  return [
    defineRoute({
      method: 'post',
      path: '/files',
      summary: 'Start an upload and get a signed URL for it',
      tag: 'Files',
      input: {
        body: z.strictObject({
          purpose: z.literal('avatar'),
          mimeType: z.enum(AVATAR_MIME_TYPES),
          sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
        }),
      },
      policy: ownAccount,
      output: z.object({
        id: z.uuid(),
        uploadUrl: z.string(),
        uploadHeaders: z.record(z.string(), z.string()),
      }),
      successStatus: 201,
      handler: async ({ actor, body }) => {
        if (actor.kind !== 'user') throw new Error('Policy lets only users through');
        return service.createAvatarUpload(actor.userId, body);
      },
    }),

    defineRoute({
      method: 'post',
      path: '/files/:id/complete',
      summary: 'Check the uploaded content and make the file usable',
      tag: 'Files',
      input: { params: idParams },
      policy: fileOwner(db),
      output: z.object({ status: z.literal('ok') }),
      handler: async ({ params }) => {
        await service.completeUpload(params.id);
        return { status: 'ok' as const };
      },
    }),
  ];
};
