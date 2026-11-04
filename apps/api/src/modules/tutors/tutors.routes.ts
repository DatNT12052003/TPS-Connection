import type { DataSource } from 'typeorm';
import { z } from 'zod';
import type { UserActor } from '../../auth/actor.js';
import type { FileStore } from '../../files/file-store.js';
import { notFound } from '../../http/errors.js';
import { defineRoute } from '../../http/route.js';
import { publicAccess } from '../../policies/policy.js';
import { tutorOnly } from '../../policies/roles.policy.js';
import { filesService } from '../files/files.service.js';
import { tutorsService } from './tutors.service.js';

const teachingModes = z.enum(['online', 'offline']);
const tutorType = z.enum(['student', 'teacher', 'freelance']);
const ids = z.array(z.uuid()).min(1).max(50);
const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const longText = z.string().trim().min(1).max(5000);

const availabilitySlot = z
  .strictObject({ weekday: z.number().int().min(0).max(6), startTime: time, endTime: time })
  .refine((slot) => slot.startTime < slot.endTime, { path: ['endTime'] });

const ownProfileDto = z.object({
  verificationStatus: z.enum(['incomplete', 'pending_review', 'verified', 'rejected', 'revoked']),
  profile: z
    .object({
      legalName: z.string(),
      tutorType,
      organization: z.string().nullable(),
      introduction: z.string(),
      experience: z.string().nullable(),
      teachingMethod: z.string().nullable(),
      pricePerLessonVnd: z.number(),
      lessonMinutes: z.number(),
      teachingModes: z.array(teachingModes),
      acceptingStudents: z.boolean(),
      subjectIds: z.array(z.uuid()),
      gradeIds: z.array(z.uuid()),
      regionIds: z.array(z.uuid()),
      availability: z.array(
        z.object({ weekday: z.number(), startTime: z.string(), endTime: z.string() }),
      ),
    })
    .nullable(),
});

const named = z.object({ id: z.uuid(), nameVi: z.string(), nameEn: z.string() });

/**
 * What the public may see. Listed field by field, so legal name, school, workplace,
 * phone and email cannot appear here by accident (AC-MKT-05.2). All is self-declared
 * except what a Manager checked: clients must show that difference (BR-210).
 */
const publicTutorDto = z.object({
  id: z.uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  introduction: z.string(),
  experience: z.string().nullable(),
  teachingMethod: z.string().nullable(),
  pricePerLessonVnd: z.number(),
  lessonMinutes: z.number(),
  teachingModes: z.array(teachingModes),
  acceptingStudents: z.boolean(),
  subjects: z.array(named),
  grades: z.array(named),
  provinces: z.array(named),
});

export const tutorsRoutes = (db: DataSource, store: FileStore) => {
  const service = tutorsService(db);
  const files = filesService(db, store);

  return [
    defineRoute({
      method: 'get',
      path: '/me/tutor-profile',
      summary: 'Get your own tutor profile, with fields the public never sees',
      tag: 'Tutors',
      policy: tutorOnly,
      output: ownProfileDto,
      handler: async ({ actor }) => service.findOwnProfile((actor as UserActor).userId),
    }),

    defineRoute({
      method: 'put',
      path: '/me/tutor-profile',
      summary: 'Create or replace your own tutor profile',
      tag: 'Tutors',
      input: {
        body: z.strictObject({
          legalName: z.string().trim().min(1).max(200),
          tutorType,
          organization: z.string().trim().min(1).max(200).nullable().optional(),
          introduction: longText,
          experience: longText.nullable().optional(),
          teachingMethod: longText.nullable().optional(),
          // Whole VND per lesson. There is no price per hour (AC-MKT-01.3).
          pricePerLessonVnd: z.number().int().positive().max(100_000_000),
          lessonMinutes: z.number().int().min(15).max(480),
          teachingModes: z.array(teachingModes).min(1).max(2),
          acceptingStudents: z.boolean(),
          subjectIds: ids,
          gradeIds: ids,
          regionIds: ids,
          availability: z.array(availabilitySlot).max(50),
        }),
      },
      policy: tutorOnly,
      output: ownProfileDto,
      handler: async ({ actor, body }) => {
        const { userId } = actor as UserActor;
        await service.saveOwnProfile(userId, body);
        return service.findOwnProfile(userId);
      },
    }),

    defineRoute({
      method: 'get',
      path: '/public/tutors/:id',
      summary: 'Get the public page of a verified tutor',
      tag: 'Public',
      input: { params: z.object({ id: z.uuid() }) },
      policy: publicAccess,
      output: publicTutorDto,
      handler: async ({ params }) => {
        const tutor = await service.findPublicTutor(params.id);
        if (!tutor) throw notFound();
        const { avatarFileId, ...rest } = tutor;
        return { ...rest, avatarUrl: await files.avatarUrl(avatarFileId) };
      },
    }),
  ];
};
