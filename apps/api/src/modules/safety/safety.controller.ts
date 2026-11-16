import type { BlockedUserParams, CreateBlockRequest, CreateReportRequest } from '@tps/shared';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../http/authorize.js';
import type { SafetyService } from './safety.service.js';

/** HTTP cho chặn (`/me/blocks`) và báo cáo (`/reports`). */
export function createSafetyController(service: SafetyService) {
  const blocks: RequestHandler = async (req, res) => {
    res.json(await service.blocks(requireAuth(req).user.id));
  };

  const block: RequestHandler<unknown, unknown, CreateBlockRequest> = async (req, res) => {
    res.status(201).json(await service.block(requireAuth(req).user.id, req.body));
  };

  const unblock: RequestHandler<BlockedUserParams> = async (req, res) => {
    await service.unblock(requireAuth(req).user.id, req.params.userId);
    res.status(204).end();
  };

  const report: RequestHandler<unknown, unknown, CreateReportRequest> = async (req, res) => {
    res.status(202).json(await service.report(requireAuth(req).user.id, req.body));
  };

  return { blocks, block, unblock, report };
}

export type SafetyController = ReturnType<typeof createSafetyController>;
