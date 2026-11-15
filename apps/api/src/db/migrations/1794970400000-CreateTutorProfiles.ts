import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hồ sơ gia sư và các bảng con (docs/thiet_ke_co_so_du_lieu.md mục 5.1; G2 phần 5).
 *
 * - `tutor_profiles` 1-1 với `users`. Các cột văn bản là tự khai; đã xác minh là `identity_verified_at`
 *   và từng dòng `tutor_credentials` có `verification_status = 'verified'`.
 * - Hiển thị công khai khi `profile_status = 'verified'` (D5, C8): CHECK bảo đảm đã có `identity_verified_at`.
 * - Cột `search_vector` và index tìm kiếm thêm ở G4 (marketplace), cùng truy vấn tìm kiếm.
 * - Bảng con thuần túy (môn – khối, khu vực, lịch rảnh) dùng ON DELETE CASCADE (mục 1.4).
 */
export class CreateTutorProfiles1794970400000 implements MigrationInterface {
  name = 'CreateTutorProfiles1794970400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tutor_profiles (
        user_id               uuid         PRIMARY KEY REFERENCES users (id),
        headline              text,
        bio                   text,
        occupation            text,
        institution           text,
        major                 text,
        highest_education     text,
        experience_years      smallint,
        teaching_method       text,
        achievements          text,
        intro_video_url       text,
        teaches_online        boolean      NOT NULL DEFAULT false,
        teaches_in_person     boolean      NOT NULL DEFAULT false,
        rate_amount_vnd       bigint,
        rate_unit             text,
        accepting_students    boolean      NOT NULL DEFAULT true,
        profile_status        text         NOT NULL DEFAULT 'incomplete',
        identity_verified_at  timestamptz,
        has_verified_degree   boolean      NOT NULL DEFAULT false,
        rating_avg            numeric(3, 2),
        rating_count          integer      NOT NULL DEFAULT 0,
        created_at            timestamptz  NOT NULL DEFAULT now(),
        updated_at            timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT tutor_profiles_occupation_chk
          CHECK (occupation IN ('university_student', 'teacher', 'professional', 'other')),
        CONSTRAINT tutor_profiles_experience_years_chk CHECK (experience_years BETWEEN 0 AND 80),
        CONSTRAINT tutor_profiles_rate_amount_chk CHECK (rate_amount_vnd >= 0),
        CONSTRAINT tutor_profiles_rate_unit_chk CHECK (rate_unit IN ('hour', 'session')),
        CONSTRAINT tutor_profiles_rate_complete_chk
          CHECK ((rate_amount_vnd IS NULL) = (rate_unit IS NULL)),
        CONSTRAINT tutor_profiles_status_chk
          CHECK (profile_status IN ('incomplete', 'pending_verification', 'verified')),
        CONSTRAINT tutor_profiles_verified_needs_identity_chk
          CHECK (profile_status <> 'verified' OR identity_verified_at IS NOT NULL),
        CONSTRAINT tutor_profiles_rating_avg_chk CHECK (rating_avg BETWEEN 1 AND 5),
        CONSTRAINT tutor_profiles_rating_count_chk CHECK (rating_count >= 0)
      )
    `);
    // Danh sách gia sư công khai (G4) lọc trên tập này.
    await queryRunner.query(
      `CREATE INDEX tutor_profiles_verified_idx ON tutor_profiles (user_id) WHERE profile_status = 'verified'`,
    );

    await queryRunner.query(`
      CREATE TABLE tutor_teaching_subjects (
        tutor_id        uuid    NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
        subject_id      integer NOT NULL REFERENCES subjects (id),
        grade_level_id  integer NOT NULL REFERENCES grade_levels (id),
        PRIMARY KEY (tutor_id, subject_id, grade_level_id)
      )
    `);
    // Tìm gia sư theo môn và khối (G4).
    await queryRunner.query(`
      CREATE INDEX tutor_teaching_subjects_search_idx
        ON tutor_teaching_subjects (subject_id, grade_level_id, tutor_id)
    `);

    await queryRunner.query(`
      CREATE TABLE tutor_service_areas (
        tutor_id  uuid    NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
        area_id   integer NOT NULL REFERENCES administrative_areas (id),
        PRIMARY KEY (tutor_id, area_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX tutor_service_areas_area_idx ON tutor_service_areas (area_id, tutor_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE tutor_availability_slots (
        id          uuid     PRIMARY KEY DEFAULT uuidv7(),
        tutor_id    uuid     NOT NULL REFERENCES tutor_profiles (user_id) ON DELETE CASCADE,
        weekday     smallint NOT NULL,
        start_time  time     NOT NULL,
        end_time    time     NOT NULL,
        CONSTRAINT tutor_availability_slots_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
        CONSTRAINT tutor_availability_slots_range_chk CHECK (end_time > start_time)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX tutor_availability_slots_tutor_idx ON tutor_availability_slots (tutor_id)`,
    );
    // Lọc theo lịch rảnh (G4).
    await queryRunner.query(`
      CREATE INDEX tutor_availability_slots_search_idx
        ON tutor_availability_slots (weekday, start_time, end_time)
    `);

    await queryRunner.query(`
      CREATE TABLE tutor_credentials (
        id                   uuid        PRIMARY KEY DEFAULT uuidv7(),
        tutor_id             uuid        NOT NULL REFERENCES tutor_profiles (user_id),
        kind                 text        NOT NULL,
        title                text        NOT NULL,
        issuer               text,
        issued_year          smallint,
        verification_status  text        NOT NULL DEFAULT 'self_declared',
        verified_at          timestamptz,
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tutor_credentials_kind_chk CHECK (kind IN ('degree', 'certificate', 'student_card')),
        CONSTRAINT tutor_credentials_status_chk
          CHECK (verification_status IN ('self_declared', 'pending', 'verified', 'rejected')),
        CONSTRAINT tutor_credentials_verified_at_chk
          CHECK ((verification_status = 'verified') = (verified_at IS NOT NULL)),
        CONSTRAINT tutor_credentials_title_chk CHECK (length(btrim(title)) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX tutor_credentials_tutor_idx ON tutor_credentials (tutor_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE tutor_credentials`);
    await queryRunner.query(`DROP TABLE tutor_availability_slots`);
    await queryRunner.query(`DROP TABLE tutor_service_areas`);
    await queryRunner.query(`DROP TABLE tutor_teaching_subjects`);
    await queryRunner.query(`DROP TABLE tutor_profiles`);
  }
}
