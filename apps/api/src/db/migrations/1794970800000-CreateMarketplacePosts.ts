import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bài đăng marketplace (docs/thiet_ke_co_so_du_lieu.md mục 6.2, 6.3; trạng thái B.2, B.3; G4 đợt 1).
 *
 * - `tutor_posts`: bài tuyển học sinh của gia sư, kèm môn × khối, khu vực dạy trực tiếp, lịch dạy. Nháp được thiếu
 *   hình thức dạy; đã đăng (khác `draft`) thì phải có ít nhất một hình thức và có `published_at`. Chỉ gia sư đã xác
 *   minh mới đăng được (D5): kiểm tra ở service vì phụ thuộc bảng khác.
 * - `request_posts`: bài tìm gia sư của phụ huynh, một hồ sơ con và một môn (D25). Chỉ tỉnh/xã, không địa chỉ
 *   (§16.7). Mỗi hồ sơ con chỉ có một bài chưa đóng cho mỗi môn (unique một phần).
 * - `moderation_hidden_at`: Manager ẩn bài vi phạm (G8), độc lập với trạng thái.
 * - Cột `search_vector` và index tìm kiếm thêm ở đợt 2 (tìm kiếm), cùng truy vấn dùng chúng.
 */
export class CreateMarketplacePosts1794970800000 implements MigrationInterface {
  name = 'CreateMarketplacePosts1794970800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tutor_posts (
        id                    uuid         PRIMARY KEY DEFAULT uuidv7(),
        tutor_id              uuid         NOT NULL REFERENCES tutor_profiles (user_id),
        title                 text         NOT NULL,
        description           text         NOT NULL,
        teaches_online        boolean      NOT NULL DEFAULT false,
        teaches_in_person     boolean      NOT NULL DEFAULT false,
        rate_amount_vnd       bigint,
        rate_unit             text,
        capacity              smallint,
        available_from        date,
        status                text         NOT NULL DEFAULT 'draft',
        moderation_hidden_at  timestamptz,
        published_at          timestamptz,
        view_count            integer      NOT NULL DEFAULT 0,
        deleted_at            timestamptz,
        created_at            timestamptz  NOT NULL DEFAULT now(),
        updated_at            timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT tutor_posts_title_chk CHECK (length(btrim(title)) > 0),
        CONSTRAINT tutor_posts_description_chk CHECK (length(btrim(description)) > 0),
        CONSTRAINT tutor_posts_rate_amount_chk CHECK (rate_amount_vnd >= 0),
        CONSTRAINT tutor_posts_rate_unit_chk CHECK (rate_unit IN ('hour', 'session')),
        CONSTRAINT tutor_posts_rate_complete_chk
          CHECK ((rate_amount_vnd IS NULL) = (rate_unit IS NULL)),
        CONSTRAINT tutor_posts_capacity_chk CHECK (capacity > 0),
        CONSTRAINT tutor_posts_status_chk
          CHECK (status IN ('draft', 'open', 'paused', 'full', 'closed')),
        CONSTRAINT tutor_posts_published_mode_chk
          CHECK (status = 'draft' OR teaches_online OR teaches_in_person),
        CONSTRAINT tutor_posts_published_at_chk CHECK (status = 'draft' OR published_at IS NOT NULL),
        CONSTRAINT tutor_posts_view_count_chk CHECK (view_count >= 0)
      )
    `);
    // Danh sách bài công khai mới nhất (đợt 2).
    await queryRunner.query(`
      CREATE INDEX tutor_posts_public_idx ON tutor_posts (published_at DESC)
        WHERE status = 'open' AND deleted_at IS NULL AND moderation_hidden_at IS NULL
    `);
    // "Bài của tôi" lọc theo trạng thái; đếm bài chưa đóng của một gia sư.
    await queryRunner.query(`
      CREATE INDEX tutor_posts_tutor_idx ON tutor_posts (tutor_id, status) WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE tutor_post_subjects (
        post_id         uuid    NOT NULL REFERENCES tutor_posts (id) ON DELETE CASCADE,
        subject_id      integer NOT NULL REFERENCES subjects (id),
        grade_level_id  integer NOT NULL REFERENCES grade_levels (id),
        PRIMARY KEY (post_id, subject_id, grade_level_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX tutor_post_subjects_search_idx
        ON tutor_post_subjects (subject_id, grade_level_id, post_id)
    `);

    await queryRunner.query(`
      CREATE TABLE tutor_post_areas (
        post_id  uuid    NOT NULL REFERENCES tutor_posts (id) ON DELETE CASCADE,
        area_id  integer NOT NULL REFERENCES administrative_areas (id),
        PRIMARY KEY (post_id, area_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX tutor_post_areas_area_idx ON tutor_post_areas (area_id, post_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE tutor_post_slots (
        id          uuid     PRIMARY KEY DEFAULT uuidv7(),
        post_id     uuid     NOT NULL REFERENCES tutor_posts (id) ON DELETE CASCADE,
        weekday     smallint NOT NULL,
        start_time  time     NOT NULL,
        end_time    time     NOT NULL,
        CONSTRAINT tutor_post_slots_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
        CONSTRAINT tutor_post_slots_range_chk CHECK (end_time > start_time)
      )
    `);
    await queryRunner.query(`CREATE INDEX tutor_post_slots_post_idx ON tutor_post_slots (post_id)`);

    await queryRunner.query(`
      CREATE TABLE request_posts (
        id                    uuid         PRIMARY KEY DEFAULT uuidv7(),
        author_user_id        uuid         NOT NULL REFERENCES users (id),
        learner_id            uuid         NOT NULL REFERENCES learners (id),
        subject_id            integer      NOT NULL REFERENCES subjects (id),
        grade_level_id        integer      NOT NULL REFERENCES grade_levels (id),
        goal                  text         NOT NULL,
        goal_note             text,
        teaching_mode         text         NOT NULL,
        province_id           integer      REFERENCES administrative_areas (id),
        commune_id            integer      REFERENCES administrative_areas (id),
        budget_min_vnd        bigint,
        budget_max_vnd        bigint,
        budget_unit           text,
        desired_start_date    date,
        tutor_requirements    text,
        description           text,
        status                text         NOT NULL DEFAULT 'draft',
        closed_reason         text,
        moderation_hidden_at  timestamptz,
        published_at          timestamptz,
        deleted_at            timestamptz,
        created_at            timestamptz  NOT NULL DEFAULT now(),
        updated_at            timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT request_posts_goal_chk
          CHECK (goal IN ('reinforce', 'exam_prep', 'advanced', 'other')),
        CONSTRAINT request_posts_teaching_mode_chk
          CHECK (teaching_mode IN ('online', 'in_person', 'hybrid')),
        CONSTRAINT request_posts_in_person_province_chk
          CHECK (teaching_mode = 'online' OR province_id IS NOT NULL),
        CONSTRAINT request_posts_commune_needs_province_chk
          CHECK (commune_id IS NULL OR province_id IS NOT NULL),
        CONSTRAINT request_posts_budget_min_chk CHECK (budget_min_vnd >= 0),
        CONSTRAINT request_posts_budget_max_chk CHECK (budget_max_vnd >= 0),
        CONSTRAINT request_posts_budget_range_chk
          CHECK (budget_min_vnd IS NULL OR budget_max_vnd IS NULL OR budget_min_vnd <= budget_max_vnd),
        CONSTRAINT request_posts_budget_unit_chk CHECK (budget_unit IN ('hour', 'session', 'month')),
        CONSTRAINT request_posts_budget_complete_chk
          CHECK ((budget_min_vnd IS NULL AND budget_max_vnd IS NULL) = (budget_unit IS NULL)),
        CONSTRAINT request_posts_status_chk CHECK (status IN ('draft', 'open', 'hidden', 'closed')),
        CONSTRAINT request_posts_closed_reason_chk
          CHECK (closed_reason IN ('found_tutor', 'no_longer_needed', 'other')),
        CONSTRAINT request_posts_closed_reason_complete_chk
          CHECK ((status = 'closed') = (closed_reason IS NOT NULL)),
        CONSTRAINT request_posts_published_at_chk CHECK (status = 'draft' OR published_at IS NOT NULL)
      )
    `);
    // Gia sư đã xác minh lọc nhu cầu theo môn, khối, khu vực (đợt 2).
    await queryRunner.query(`
      CREATE INDEX request_posts_search_idx
        ON request_posts (subject_id, grade_level_id, province_id, published_at DESC)
        WHERE status = 'open' AND deleted_at IS NULL AND moderation_hidden_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX request_posts_author_idx ON request_posts (author_user_id, status)
        WHERE deleted_at IS NULL
    `);
    // Một bài chưa đóng cho mỗi hồ sơ con × môn (D25); cũng dùng khi xóa hồ sơ con.
    await queryRunner.query(`
      CREATE UNIQUE INDEX request_posts_learner_subject_active_uq
        ON request_posts (learner_id, subject_id)
        WHERE deleted_at IS NULL AND status <> 'closed'
    `);
    await queryRunner.query(`CREATE INDEX request_posts_learner_idx ON request_posts (learner_id)`);

    await queryRunner.query(`
      CREATE TABLE request_post_slots (
        id          uuid     PRIMARY KEY DEFAULT uuidv7(),
        post_id     uuid     NOT NULL REFERENCES request_posts (id) ON DELETE CASCADE,
        weekday     smallint NOT NULL,
        start_time  time     NOT NULL,
        end_time    time     NOT NULL,
        CONSTRAINT request_post_slots_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
        CONSTRAINT request_post_slots_range_chk CHECK (end_time > start_time)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX request_post_slots_post_idx ON request_post_slots (post_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE request_post_slots`);
    await queryRunner.query(`DROP TABLE request_posts`);
    await queryRunner.query(`DROP TABLE tutor_post_slots`);
    await queryRunner.query(`DROP TABLE tutor_post_areas`);
    await queryRunner.query(`DROP TABLE tutor_post_subjects`);
    await queryRunner.query(`DROP TABLE tutor_posts`);
  }
}
