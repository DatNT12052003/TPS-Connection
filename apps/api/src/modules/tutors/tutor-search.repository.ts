// Truy vấn tìm gia sư công khai (G4 đợt 2, §4.3). SQL viết tay vì bộ lọc là các EXISTS trên bảng con và cần index
// cụ thể; mọi giá trị từ client đi qua tham số ($n), không ghép chuỗi.
//
// Điều kiện hiển thị (D5, C8): `profile_status = 'verified'`, tài khoản `active`, chưa xóa. Chỉ môn, khối đang bật.
import type { RateUnit, TeachingSubject, TutorSearchQuery } from '@tps/shared';
import type { EntityManager } from 'typeorm';

export interface TutorSearchRow {
  user_id: string;
  public_code: string;
  display_name: string;
  avatar_storage_key: string | null;
  headline: string | null;
  teaches_online: boolean;
  teaches_in_person: boolean;
  rate_amount_vnd: string | null;
  rate_unit: RateUnit | null;
  experience_years: number | null;
  has_verified_degree: boolean;
  accepting_students: boolean;
  rating_avg: string | null;
  rating_count: number;
  updated_at: Date;
}

/** Thoát ký tự đặc biệt của LIKE trong từ khóa người dùng gõ. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Gom tham số và mệnh đề WHERE. */
class SqlBuilder {
  readonly params: unknown[] = [];
  readonly where: string[] = [];

  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}

/** Biểu thức tsquery của từ khóa: bỏ dấu, chữ thường, cú pháp như ô tìm kiếm web. */
const tsQuery = (placeholder: string) =>
  `websearch_to_tsquery('simple', immutable_unaccent(lower(${placeholder})))`;

/**
 * Mệnh đề WHERE chung cho danh sách và đếm. Index dùng: `tutor_profiles_verified_idx`,
 * `tutor_teaching_subjects_search_idx`, `tutor_service_areas_area_idx`, `tutor_availability_slots_search_idx`,
 * `tutor_profiles_search_idx`, `users_display_name_trgm_idx`.
 */
function buildFilters(query: TutorSearchQuery): {
  sql: SqlBuilder;
  rankExpr: string;
} {
  const sql = new SqlBuilder();
  const w = sql.where;
  w.push(`p.profile_status = 'verified'`, `u.status = 'active'`, `u.deleted_at IS NULL`);

  if (query.subjectId !== undefined || query.gradeLevelId !== undefined) {
    const conds = ['ts.tutor_id = p.user_id'];
    if (query.subjectId !== undefined) conds.push(`ts.subject_id = ${sql.param(query.subjectId)}`);
    if (query.gradeLevelId !== undefined) {
      conds.push(`ts.grade_level_id = ${sql.param(query.gradeLevelId)}`);
    }
    w.push(`EXISTS (
      SELECT 1 FROM tutor_teaching_subjects ts
        JOIN subjects s ON s.id = ts.subject_id AND s.is_active
        JOIN grade_levels g ON g.id = ts.grade_level_id AND g.is_active
       WHERE ${conds.join(' AND ')})`);
  }

  if (query.mode === 'online') w.push('p.teaches_online');
  if (query.mode === 'in_person') w.push('p.teaches_in_person');

  // Khu vực chỉ có nghĩa với dạy trực tiếp: gia sư chỉ dạy trực tuyến không khớp bộ lọc khu vực.
  if (query.communeId !== undefined) {
    const commune = sql.param(query.communeId);
    w.push(`p.teaches_in_person AND EXISTS (
      SELECT 1 FROM tutor_service_areas sa
       WHERE sa.tutor_id = p.user_id
         AND (sa.area_id = ${commune}
              OR sa.area_id = (SELECT parent_id FROM administrative_areas WHERE id = ${commune})))`);
  } else if (query.provinceId !== undefined) {
    const province = sql.param(query.provinceId);
    w.push(`p.teaches_in_person AND EXISTS (
      SELECT 1 FROM tutor_service_areas sa JOIN administrative_areas a ON a.id = sa.area_id
       WHERE sa.tutor_id = p.user_id AND (a.id = ${province} OR a.parent_id = ${province}))`);
  }

  if (query.rateUnit !== undefined) w.push(`p.rate_unit = ${sql.param(query.rateUnit)}`);
  if (query.minRate !== undefined) w.push(`p.rate_amount_vnd >= ${sql.param(query.minRate)}`);
  if (query.maxRate !== undefined) w.push(`p.rate_amount_vnd <= ${sql.param(query.maxRate)}`);
  if (query.minExperience !== undefined) {
    w.push(`p.experience_years >= ${sql.param(query.minExperience)}`);
  }

  if (query.weekday !== undefined) {
    const conds = ['sl.tutor_id = p.user_id', `sl.weekday = ${sql.param(query.weekday)}`];
    if (query.from !== undefined) conds.push(`sl.start_time <= ${sql.param(query.from)}::time`);
    if (query.to !== undefined) conds.push(`sl.end_time >= ${sql.param(query.to)}::time`);
    w.push(`EXISTS (SELECT 1 FROM tutor_availability_slots sl WHERE ${conds.join(' AND ')})`);
  }

  if (query.verifiedDegree) w.push('p.has_verified_degree');
  if (query.acceptingOnly) w.push('p.accepting_students');

  let rankExpr = '0';
  if (query.q !== undefined) {
    const q = sql.param(query.q);
    const like = sql.param(`%${escapeLike(query.q.toLowerCase())}%`);
    // Tên hiển thị khớp được tính cao hơn nội dung hồ sơ.
    const nameMatch = `immutable_unaccent(lower(u.display_name)) LIKE immutable_unaccent(${like})`;
    w.push(`(p.search_vector @@ ${tsQuery(q)} OR ${nameMatch})`);
    rankExpr = `(ts_rank(p.search_vector, ${tsQuery(q)}) + CASE WHEN ${nameMatch} THEN 1 ELSE 0 END)`;
  }
  return { sql, rankExpr };
}

/**
 * Thứ tự kết quả. `relevance` không có từ khóa khớp đúng index `tutor_profiles_ranking_idx` (đọc theo index, không
 * phải sắp xếp toàn bộ gia sư); có từ khóa thì chèn độ khớp ngay sau "đang nhận học sinh".
 */
function orderBy(query: TutorSearchQuery): string {
  const rest = `p.has_verified_degree DESC, p.rating_avg DESC NULLS LAST,
                p.experience_years DESC NULLS LAST, p.updated_at DESC`;
  switch (query.sort) {
    case 'relevance':
      return query.q !== undefined
        ? `p.accepting_students DESC, match_rank DESC, ${rest}`
        : `p.accepting_students DESC, ${rest}`;
    case 'experience':
      return 'p.experience_years DESC NULLS LAST, p.updated_at DESC';
    case 'rate_asc':
      return 'p.rate_amount_vnd ASC NULLS LAST, p.updated_at DESC';
    case 'rate_desc':
      return 'p.rate_amount_vnd DESC NULLS LAST, p.updated_at DESC';
    case 'updated':
      return 'p.updated_at DESC';
  }
}

export function createTutorSearchRepository(manager: EntityManager) {
  return {
    /** Một trang kết quả và tổng số gia sư khớp. */
    async search(query: TutorSearchQuery): Promise<{ rows: TutorSearchRow[]; total: number }> {
      const { sql, rankExpr } = buildFilters(query);
      const from = `FROM tutor_profiles p JOIN users u ON u.id = p.user_id
                    WHERE ${sql.where.join('\n AND ')}`;

      const [count] = await manager.query<{ total: number }[]>(
        `SELECT count(*)::int AS total ${from}`,
        sql.params,
      );
      const total = count?.total ?? 0;
      if (total === 0) return { rows: [], total };

      const limit = sql.param(query.pageSize);
      const offset = sql.param((query.page - 1) * query.pageSize);
      const rows = await manager.query<TutorSearchRow[]>(
        `SELECT p.user_id, p.public_code, u.display_name, f.storage_key AS avatar_storage_key,
                p.headline, p.teaches_online, p.teaches_in_person, p.rate_amount_vnd, p.rate_unit,
                p.experience_years, p.has_verified_degree, p.accepting_students, p.rating_avg,
                p.rating_count, p.updated_at, ${rankExpr} AS match_rank
           FROM tutor_profiles p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN files f ON f.id = u.avatar_file_id AND f.status = 'ready'
          WHERE ${sql.where.join('\n AND ')}
          ORDER BY ${orderBy(query)}, p.user_id
          LIMIT ${limit} OFFSET ${offset}`,
        sql.params,
      );
      return { rows, total };
    },

    /** Môn × khối đang bật của các gia sư trong trang kết quả. */
    async subjectsOf(tutorIds: string[]): Promise<Map<string, TeachingSubject[]>> {
      const result = new Map<string, TeachingSubject[]>(tutorIds.map((id) => [id, []]));
      if (tutorIds.length === 0) return result;
      const rows = await manager.query<
        { tutor_id: string; subject_id: number; grade_level_id: number }[]
      >(
        `SELECT ts.tutor_id, ts.subject_id, ts.grade_level_id
           FROM tutor_teaching_subjects ts
           JOIN subjects s ON s.id = ts.subject_id AND s.is_active
           JOIN grade_levels g ON g.id = ts.grade_level_id AND g.is_active
          WHERE ts.tutor_id = ANY($1::uuid[])
          ORDER BY s.sort_order, g.sort_order`,
        [tutorIds],
      );
      for (const r of rows) {
        result.get(r.tutor_id)?.push({ subjectId: r.subject_id, gradeLevelId: r.grade_level_id });
      }
      return result;
    },

    /** Các tỉnh dạy trực tiếp của từng gia sư (khu vực là xã thì lấy tỉnh chứa xã). */
    async provincesOf(tutorIds: string[]): Promise<Map<string, number[]>> {
      const result = new Map<string, number[]>(tutorIds.map((id) => [id, []]));
      if (tutorIds.length === 0) return result;
      const rows = await manager.query<{ tutor_id: string; province_id: number }[]>(
        `SELECT DISTINCT sa.tutor_id, coalesce(a.parent_id, a.id) AS province_id
           FROM tutor_service_areas sa
           JOIN administrative_areas a ON a.id = sa.area_id
          WHERE sa.tutor_id = ANY($1::uuid[])
          ORDER BY province_id`,
        [tutorIds],
      );
      for (const r of rows) result.get(r.tutor_id)?.push(r.province_id);
      return result;
    },
  };
}
