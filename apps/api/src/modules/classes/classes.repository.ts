// Truy cập lớp học, ghi danh, mức học phí, mục tiêu. Không kiểm tra quyền (service làm), trừ các truy vấn "của tôi"
// luôn lọc theo người gọi: gia sư của lớp, phụ huynh đang quản lý học sinh (`learner_managers`), hoặc chính học sinh.
import type { ClassListQuery, ClassRole, TeachingMode, TutoringClassStatus } from '@tps/shared';
import type { EntityManager } from 'typeorm';
import {
  ClassEnrollmentRow,
  EnrollmentFeeRate,
  LearningGoalRow,
  TutoringClass,
} from './class.entity.js';

/** Một dòng "lớp × học sinh" kèm cột hiển thị, theo góc nhìn của một người. */
export interface ClassRow {
  id: string;
  name: string | null;
  status: TutoringClassStatus;
  subjectId: number;
  gradeLevelId: number;
  teachingMode: TeachingMode;
  startedOn: string;
  endedOn: string | null;
  endedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  tutorId: string;
  tutorName: string;
  tutorPublicCode: string;
  tutorAvatarKey: string | null;
  clientUserId: string;
  clientName: string;
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  connectionRequestId: string | null;
  activeFee: { sessionPriceVnd: number; sessionMinutes: number; effectiveFrom: Date } | null;
  feeChangePending: boolean;
  conversationId: string | null;
  myRole: ClassRole;
}

interface RawClassRow {
  id: string;
  name: string | null;
  status: TutoringClassStatus;
  subject_id: number;
  grade_level_id: number;
  teaching_mode: TeachingMode;
  started_on: string;
  ended_on: string | null;
  ended_reason: string | null;
  created_at: Date;
  updated_at: Date;
  tutor_id: string;
  tutor_name: string;
  public_code: string;
  avatar_key: string | null;
  client_user_id: string;
  client_name: string;
  enrollment_id: string;
  learner_id: string;
  learner_name: string;
  connection_request_id: string | null;
  fee_price: number | null;
  fee_minutes: number | null;
  fee_from: Date | null;
  fee_change_pending: boolean;
  conversation_id: string | null;
  my_role: ClassRole;
}

/**
 * Các dòng "lớp × học sinh" mà $1 được xem, với vai trò của $1: gia sư của lớp; phụ huynh đang quản lý học sinh (hồ
 * sơ chưa xóa); chính học sinh (hồ sơ chưa xóa). Gia sư vẫn thấy lớp của học sinh đã bị xóa hồ sơ (tra cứu lịch sử,
 * D19). Một người không thể vừa là gia sư vừa là phụ huynh của cùng một học sinh trong lớp (yêu cầu kết nối cấm).
 */
const VISIBLE_ROWS = `
  SELECT c.id, c.name, c.status, c.subject_id, c.grade_level_id, c.teaching_mode,
         c.started_on::text AS started_on, c.ended_on::text AS ended_on, c.ended_reason,
         c.created_at, c.updated_at,
         c.tutor_id, tu.display_name AS tutor_name, tp.public_code, f.storage_key AS avatar_key,
         e.client_user_id, cu.display_name AS client_name,
         e.id AS enrollment_id, e.learner_id, COALESCE(l.nickname, l.full_name, '') AS learner_name,
         e.connection_request_id,
         ar.session_price_vnd AS fee_price, ar.session_minutes AS fee_minutes, ar.effective_from AS fee_from,
         EXISTS (
           SELECT 1 FROM enrollment_fee_rates p WHERE p.enrollment_id = e.id AND p.status = 'proposed'
         ) AS fee_change_pending,
         cv.id AS conversation_id,
         CASE WHEN c.tutor_id = $1 THEN 'tutor'
              WHEN m.manager_user_id IS NOT NULL THEN 'client'
              ELSE 'student' END AS my_role
    FROM class_enrollments e
    JOIN tutoring_classes c ON c.id = e.class_id
    JOIN learners l ON l.id = e.learner_id
    JOIN users tu ON tu.id = c.tutor_id
    JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
    LEFT JOIN files f ON f.id = tu.avatar_file_id AND f.status = 'ready'
    JOIN users cu ON cu.id = e.client_user_id
    LEFT JOIN learner_managers m
           ON m.learner_id = e.learner_id AND m.manager_user_id = $1 AND l.deleted_at IS NULL
    LEFT JOIN enrollment_fee_rates ar ON ar.enrollment_id = e.id AND ar.status = 'active'
    LEFT JOIN conversations cv ON cv.connection_request_id = e.connection_request_id
   WHERE (c.tutor_id = $1
          OR m.manager_user_id IS NOT NULL
          OR (l.account_user_id = $1 AND l.deleted_at IS NULL))`;

function toClassRow(r: RawClassRow): ClassRow {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    subjectId: r.subject_id,
    gradeLevelId: r.grade_level_id,
    teachingMode: r.teaching_mode,
    startedOn: r.started_on,
    endedOn: r.ended_on,
    endedReason: r.ended_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    tutorId: r.tutor_id,
    tutorName: r.tutor_name,
    tutorPublicCode: r.public_code,
    tutorAvatarKey: r.avatar_key,
    clientUserId: r.client_user_id,
    clientName: r.client_name,
    enrollmentId: r.enrollment_id,
    learnerId: r.learner_id,
    learnerName: r.learner_name,
    connectionRequestId: r.connection_request_id,
    activeFee:
      r.fee_price === null || r.fee_minutes === null || r.fee_from === null
        ? null
        : {
            sessionPriceVnd: r.fee_price,
            sessionMinutes: r.fee_minutes,
            effectiveFrom: r.fee_from,
          },
    feeChangePending: r.fee_change_pending,
    conversationId: r.conversation_id,
    myRole: r.my_role,
  };
}

/** Dữ liệu tạo lớp từ một yêu cầu kết nối vừa xác nhận hợp tác (D9). */
export interface NewClassFromTerms {
  requestId: string;
  tutorId: string;
  clientUserId: string;
  learnerId: string;
  termsId: string;
  termsProposedBy: string;
  subjectId: number;
  gradeLevelId: number;
  teachingMode: TeachingMode;
  sessionPriceVnd: number;
  sessionMinutes: number;
  /** Ngày bắt đầu theo điều khoản; null: hôm nay (giờ Việt Nam). */
  startDate: string | null;
}

/** Ngày hôm nay theo giờ Việt Nam, tính trong database (cùng đồng hồ với `now()`). */
const TODAY_VN = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

export function createClassesRepository(manager: EntityManager) {
  const classes = manager.getRepository(TutoringClass);
  const enrollments = manager.getRepository(ClassEnrollmentRow);
  const feeRates = manager.getRepository(EnrollmentFeeRate);
  const goals = manager.getRepository(LearningGoalRow);

  return {
    /**
     * Tạo lớp 1 kèm 1, ghi danh `active` và mức học phí `active` từ điều khoản đã chốt (D9, B.5.1). Gọi trong
     * transaction xác nhận hợp tác. Trả id lớp.
     */
    async createFromTerms(data: NewClassFromTerms): Promise<string> {
      const [row] = await manager.query<{ class_id: string }[]>(
        `WITH cls AS (
           INSERT INTO tutoring_classes
                  (tutor_id, subject_id, grade_level_id, teaching_mode, started_on, created_from_request_id)
           VALUES ($1, $2, $3, $4, COALESCE($5::date, ${TODAY_VN}), $6)
           RETURNING id, started_on
         ), enr AS (
           INSERT INTO class_enrollments (class_id, learner_id, client_user_id, connection_request_id, joined_on)
           SELECT id, $7, $8, $6, started_on FROM cls
           RETURNING id, class_id
         ), fee AS (
           INSERT INTO enrollment_fee_rates
                  (enrollment_id, session_price_vnd, session_minutes, status, effective_from, proposed_by,
                   source_terms_id)
           SELECT id, $9, $10, 'active', now(), $11, $12 FROM enr
           RETURNING id
         )
         SELECT enr.class_id FROM enr, fee`,
        [
          data.tutorId,
          data.subjectId,
          data.gradeLevelId,
          data.teachingMode,
          data.startDate,
          data.requestId,
          data.learnerId,
          data.clientUserId,
          data.sessionPriceVnd,
          data.sessionMinutes,
          data.termsProposedBy,
          data.termsId,
        ],
      );
      return row!.class_id;
    },

    /** Lớp theo id (khóa dòng khi `lock`: mọi thao tác thay đổi lớp, ghi danh, học phí, mục tiêu đi qua đây). */
    findClass(id: string, options: { lock?: boolean } = {}): Promise<TutoringClass | null> {
      const query = classes.createQueryBuilder('c').where('c.id = :id', { id });
      if (options.lock) query.setLock('pessimistic_write');
      return query.getOne();
    },

    /** Các dòng "lớp × học sinh" của một lớp mà U được xem (rỗng: U không có quyền với lớp). */
    async visibleRowsOfClass(userId: string, classId: string): Promise<ClassRow[]> {
      const rows = await manager.query<RawClassRow[]>(
        `${VISIBLE_ROWS} AND c.id = $2 ORDER BY e.joined_on, e.id`,
        [userId, classId],
      );
      return rows.map(toClassRow);
    },

    /** Mọi dòng "lớp × học sinh" U được xem (lịch học, việc cần làm). Lọc theo lớp, theo con nếu có. */
    async allVisibleRows(
      userId: string,
      filter: { classId?: string | undefined; learnerId?: string | undefined } = {},
    ): Promise<ClassRow[]> {
      const params: unknown[] = [userId];
      let condition = '';
      if (filter.classId) {
        params.push(filter.classId);
        condition += ` AND c.id = $${params.length}`;
      }
      if (filter.learnerId) {
        params.push(filter.learnerId);
        condition += ` AND e.learner_id = $${params.length}`;
      }
      const rows = await manager.query<RawClassRow[]>(
        `${VISIBLE_ROWS}${condition} ORDER BY c.created_at, e.id`,
        params,
      );
      return rows.map(toClassRow);
    },

    /** Lớp của tôi: lớp đang học, tạm nghỉ trước, rồi mới nhất trước. */
    async list(
      userId: string,
      filter: ClassListQuery,
    ): Promise<{ rows: ClassRow[]; total: number }> {
      const params: unknown[] = [userId];
      const where: string[] = [];
      if (filter.as === 'tutor') where.push(`c.tutor_id = $1`);
      if (filter.as === 'client') where.push(`m.manager_user_id IS NOT NULL`);
      if (filter.as === 'student') where.push(`l.account_user_id = $1 AND c.tutor_id <> $1`);
      if (filter.state === 'current') where.push(`c.status IN ('active', 'paused')`);
      if (filter.state === 'ended') where.push(`c.status = 'ended'`);
      if (filter.learnerId) {
        params.push(filter.learnerId);
        where.push(`e.learner_id = $${params.length}`);
      }
      const condition = where.map((w) => ` AND ${w}`).join('');
      const [count] = await manager.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM (${VISIBLE_ROWS}${condition}) x`,
        params,
      );
      params.push(filter.pageSize, (filter.page - 1) * filter.pageSize);
      const rows = await manager.query<RawClassRow[]>(
        `${VISIBLE_ROWS}${condition}
          ORDER BY (c.status = 'ended'), c.created_at DESC, c.id DESC, e.id
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return { rows: rows.map(toClassRow), total: count?.n ?? 0 };
    },

    /** Mục tiêu, ghi chú, khu vực theo điều khoản đã chốt của yêu cầu tạo lớp. */
    async agreedNeed(requestId: string | null): Promise<{
      goal: string;
      goalNote: string | null;
      provinceId: number | null;
      communeId: number | null;
    } | null> {
      if (!requestId) return null;
      const [row] = await manager.query<
        {
          goal: string;
          goal_note: string | null;
          province_id: number | null;
          commune_id: number | null;
        }[]
      >(
        `SELECT t.goal, t.goal_note, t.province_id, t.commune_id
           FROM connection_requests r JOIN connection_terms t ON t.id = r.agreed_terms_id
          WHERE r.id = $1`,
        [requestId],
      );
      return row
        ? {
            goal: row.goal,
            goalNote: row.goal_note,
            provinceId: row.province_id,
            communeId: row.commune_id,
          }
        : null;
    },

    async updateClass(id: string, changes: Partial<TutoringClass>): Promise<void> {
      await classes.update({ id }, changes);
    },

    /** Kết thúc lớp: hôm nay (giờ Việt Nam), không sớm hơn ngày bắt đầu (lớp có ngày bắt đầu trong tương lai). */
    async endClass(id: string, reason: string): Promise<void> {
      await manager.query(
        `UPDATE tutoring_classes
            SET status = 'ended', ended_on = GREATEST(${TODAY_VN}, started_on), ended_reason = $2,
                paused_at = NULL, updated_at = now()
          WHERE id = $1`,
        [id, reason],
      );
    },

    // ---- Ghi danh --------------------------------------------------------------------------------

    enrollmentsOf(classId: string): Promise<ClassEnrollmentRow[]> {
      return enrollments.find({ where: { classId }, order: { joinedOn: 'ASC', id: 'ASC' } });
    },

    findEnrollment(classId: string, enrollmentId: string): Promise<ClassEnrollmentRow | null> {
      return enrollments.findOneBy({ id: enrollmentId, classId });
    },

    async updateEnrollment(id: string, changes: Partial<ClassEnrollmentRow>): Promise<void> {
      await enrollments.update({ id }, changes);
    },

    /** Ghi danh theo lớp: tạm nghỉ / học lại cùng lớp 1-1 (B.5.2). Ghi danh đã rời lớp giữ nguyên. */
    async setEnrollmentsStatus(classId: string, status: 'active' | 'paused'): Promise<void> {
      await manager.query(
        `UPDATE class_enrollments SET status = $2, updated_at = now()
          WHERE class_id = $1 AND status <> 'left'`,
        [classId, status],
      );
    },

    /** Kết thúc lớp: mọi ghi danh rời lớp cùng ngày kết thúc. */
    async leaveAll(classId: string): Promise<void> {
      await manager.query(
        `UPDATE class_enrollments e
            SET status = 'left', left_on = GREATEST(c.ended_on, e.joined_on), updated_at = now()
           FROM tutoring_classes c
          WHERE c.id = e.class_id AND e.class_id = $1 AND e.status <> 'left'`,
        [classId],
      );
    },

    // ---- Học phí ---------------------------------------------------------------------------------

    feeRatesOf(enrollmentIds: string[]): Promise<EnrollmentFeeRate[]> {
      if (enrollmentIds.length === 0) return Promise.resolve([]);
      return feeRates
        .createQueryBuilder('r')
        .where('r.enrollmentId IN (:...ids)', { ids: enrollmentIds })
        .orderBy('r.createdAt', 'DESC')
        .addOrderBy('r.id', 'DESC')
        .getMany();
    },

    findFeeRate(enrollmentId: string, rateId: string): Promise<EnrollmentFeeRate | null> {
      return feeRates.findOneBy({ id: rateId, enrollmentId });
    },

    async hasProposedFee(enrollmentId: string): Promise<boolean> {
      return (await feeRates.countBy({ enrollmentId, status: 'proposed' })) > 0;
    },

    async proposeFee(data: {
      enrollmentId: string;
      sessionPriceVnd: number;
      sessionMinutes: number;
      note: string | null;
      proposedBy: string;
    }): Promise<EnrollmentFeeRate> {
      return feeRates.save(feeRates.create({ ...data, status: 'proposed' }));
    },

    async decideFee(
      rateId: string,
      status: 'rejected' | 'withdrawn',
      decidedBy: string | null,
    ): Promise<void> {
      await feeRates.update({ id: rateId }, { status, decidedBy, decidedAt: new Date() });
    },

    /**
     * Phụ huynh đồng ý mức đề xuất (D17, B.5.3): mức đang áp dụng → `superseded`, mức đề xuất → `active` từ bây giờ.
     * Thứ tự cập nhật giữ `enrollment_fee_rates_active_uq` (tối đa một mức `active`).
     */
    async activateFee(enrollmentId: string, rateId: string, decidedBy: string): Promise<void> {
      await manager.query(
        `UPDATE enrollment_fee_rates SET status = 'superseded'
          WHERE enrollment_id = $1 AND status = 'active'`,
        [enrollmentId],
      );
      await feeRates.update(
        { id: rateId },
        { status: 'active', effectiveFrom: new Date(), decidedBy, decidedAt: new Date() },
      );
    },

    /** Lớp kết thúc: đề xuất còn chờ tự rút. */
    async withdrawProposedFees(classId: string): Promise<void> {
      await manager.query(
        `UPDATE enrollment_fee_rates r SET status = 'withdrawn', decided_at = now()
           FROM class_enrollments e
          WHERE e.id = r.enrollment_id AND e.class_id = $1 AND r.status = 'proposed'`,
        [classId],
      );
    },

    // ---- Mục tiêu --------------------------------------------------------------------------------

    goalsOf(enrollmentIds: string[]): Promise<LearningGoalRow[]> {
      if (enrollmentIds.length === 0) return Promise.resolve([]);
      return goals
        .createQueryBuilder('g')
        .where('g.enrollmentId IN (:...ids)', { ids: enrollmentIds })
        .orderBy('g.periodStart', 'DESC')
        .addOrderBy('g.createdAt', 'DESC')
        .getMany();
    },

    countGoals(enrollmentId: string): Promise<number> {
      return goals.countBy({ enrollmentId });
    },

    findGoal(enrollmentId: string, goalId: string): Promise<LearningGoalRow | null> {
      return goals.findOneBy({ id: goalId, enrollmentId });
    },

    async createGoal(
      data: Pick<
        LearningGoalRow,
        'enrollmentId' | 'periodType' | 'periodStart' | 'periodEnd' | 'description' | 'createdBy'
      >,
    ): Promise<LearningGoalRow> {
      return goals.save(goals.create({ ...data, status: 'active' }));
    },

    async updateGoal(id: string, changes: Partial<LearningGoalRow>): Promise<void> {
      await goals.update({ id }, changes);
    },

    // ---- Thông tin chỉ mở sau khi xác nhận hợp tác (D16) -----------------------------------------

    async contactOf(
      userId: string,
    ): Promise<{ fullName: string | null; email: string | null; phone: string | null }> {
      const [row] = await manager.query<
        { full_name: string | null; email: string | null; phone: string | null }[]
      >(`SELECT full_name, email, phone FROM users WHERE id = $1`, [userId]);
      return {
        fullName: row?.full_name ?? null,
        email: row?.email ?? null,
        phone: row?.phone ?? null,
      };
    },

    async learnerIdentity(learnerId: string): Promise<{
      fullName: string | null;
      nickname: string | null;
      schoolName: string | null;
      addressLine: string | null;
    }> {
      const [row] = await manager.query<
        {
          full_name: string | null;
          nickname: string | null;
          school_name: string | null;
          address_line: string | null;
        }[]
      >(`SELECT full_name, nickname, school_name, address_line FROM learners WHERE id = $1`, [
        learnerId,
      ]);
      return {
        fullName: row?.full_name ?? null,
        nickname: row?.nickname ?? null,
        schoolName: row?.school_name ?? null,
        addressLine: row?.address_line ?? null,
      };
    },

    // ---- Dùng ở module khác ----------------------------------------------------------------------

    /** Người học còn ghi danh trong lớp chưa kết thúc (chặn xóa hồ sơ con, C2). */
    async learnerHasOpenClass(learnerId: string): Promise<boolean> {
      const rows = await manager.query<unknown[]>(
        `SELECT 1 FROM class_enrollments e JOIN tutoring_classes c ON c.id = e.class_id
          WHERE e.learner_id = $1 AND c.status <> 'ended' LIMIT 1`,
        [learnerId],
      );
      return rows.length > 0;
    },
  };
}

export type ClassesRepository = ReturnType<typeof createClassesRepository>;
