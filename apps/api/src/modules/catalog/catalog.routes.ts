import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { defineRoute } from '../../http/route.js';
import { publicAccess } from '../../policies/policy.js';
import { SubjectEntity } from './subject.entity.js';

const subjectListDto = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      nameVi: z.string(),
      nameEn: z.string(),
    }),
  ),
});

export const catalogRoutes = (db: DataSource) => [
  defineRoute({
    method: 'get',
    path: '/catalog/subjects',
    summary: 'List active subjects',
    tag: 'Catalog',
    policy: publicAccess,
    output: subjectListDto,
    handler: async () => ({
      data: await db
        .getRepository(SubjectEntity)
        .find({ where: { isActive: true }, order: { nameVi: 'ASC' } }),
    }),
  }),
];
