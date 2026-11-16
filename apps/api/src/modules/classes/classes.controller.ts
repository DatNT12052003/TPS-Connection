import type {
  ClassIdParams,
  ClassListQuery,
  CreateLearningGoalRequest,
  EndClassRequest,
  EnrollmentParams,
  FeeRateParams,
  LearningGoalParams,
  ProposeFeeRateRequest,
  UpdateClassRequest,
  UpdateEnrollmentNotesRequest,
  UpdateLearningGoalRequest,
} from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { ClassesService } from './classes.service.js';

const userIdOf = (req: Parameters<typeof requireAuth>[0]) => requireAuth(req).user.id;

/** HTTP cho lớp học (`/classes`). */
export function createClassesController(service: ClassesService) {
  const list: RequestHandler = async (req, res) => {
    res.json(await service.list(userIdOf(req), req.query as unknown as ClassListQuery));
  };

  const get: RequestHandler<ClassIdParams> = async (req, res) => {
    res.json(await service.get(userIdOf(req), req.params.classId));
  };

  const update: RequestHandler<ClassIdParams, unknown, UpdateClassRequest> = async (req, res) => {
    res.json(await service.rename(userIdOf(req), req.params.classId, req.body.name));
  };

  const pause: RequestHandler<ClassIdParams> = async (req, res) => {
    res.json(await service.pause(userIdOf(req), req.params.classId));
  };

  const resume: RequestHandler<ClassIdParams> = async (req, res) => {
    res.json(await service.resume(userIdOf(req), req.params.classId));
  };

  const end: RequestHandler<ClassIdParams, unknown, EndClassRequest> = async (req, res) => {
    res.json(await service.end(userIdOf(req), req.params.classId, req.body.reason));
  };

  const updateNotes: RequestHandler<
    EnrollmentParams,
    unknown,
    UpdateEnrollmentNotesRequest
  > = async (req, res) => {
    const { classId, enrollmentId } = req.params;
    res.json(await service.updateEnrollmentNotes(userIdOf(req), classId, enrollmentId, req.body));
  };

  const proposeFee: RequestHandler<EnrollmentParams, unknown, ProposeFeeRateRequest> = async (
    req,
    res,
  ) => {
    const { classId, enrollmentId } = req.params;
    res.status(201).json(await service.proposeFee(userIdOf(req), classId, enrollmentId, req.body));
  };

  const decideFee =
    (decision: 'accept' | 'reject' | 'withdraw'): RequestHandler<FeeRateParams> =>
    async (req, res) => {
      const { classId, enrollmentId, rateId } = req.params;
      res.json(await service.decideFee(userIdOf(req), classId, enrollmentId, rateId, decision));
    };

  const createGoal: RequestHandler<EnrollmentParams, unknown, CreateLearningGoalRequest> = async (
    req,
    res,
  ) => {
    const { classId, enrollmentId } = req.params;
    res.status(201).json(await service.createGoal(userIdOf(req), classId, enrollmentId, req.body));
  };

  const updateGoal: RequestHandler<LearningGoalParams, unknown, UpdateLearningGoalRequest> = async (
    req,
    res,
  ) => {
    const { classId, enrollmentId, goalId } = req.params;
    res.json(await service.updateGoal(userIdOf(req), classId, enrollmentId, goalId, req.body));
  };

  return {
    list,
    get,
    update,
    pause,
    resume,
    end,
    updateNotes,
    proposeFee,
    acceptFee: decideFee('accept'),
    rejectFee: decideFee('reject'),
    withdrawFee: decideFee('withdraw'),
    createGoal,
    updateGoal,
  };
}

export type ClassesController = ReturnType<typeof createClassesController>;
