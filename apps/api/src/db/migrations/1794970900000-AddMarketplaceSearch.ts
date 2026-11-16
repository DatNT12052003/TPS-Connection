import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tìm kiếm marketplace (G4 đợt 2; docs/thiet_ke_co_so_du_lieu.md mục 5.1, 6.2).
 *
 * - `public_code`: 10 ký tự hex ngẫu nhiên, cuối slug công khai (`/tutors/thay-nam-a1b2c3d4e5`, D56). Phần chữ của
 *   slug sinh từ tên hiển thị hoặc tiêu đề lúc trả về, nên đổi tên không làm hỏng đường dẫn cũ.
 * - `search_vector`: cột GENERATED từ các trường văn bản của chính bảng, bỏ dấu và chữ thường, cấu hình `simple`
 *   (không tách gốc từ: tiếng Việt không có bộ tách gốc trong PostgreSQL). Tìm bằng
 *   `websearch_to_tsquery('simple', immutable_unaccent(lower(q)))`. Tên hiển thị nằm ở `users` nên tìm riêng bằng
 *   trigram (`users_display_name_trgm_idx`); không tìm theo họ tên thật hay email (không lộ qua tìm kiếm công khai).
 * - Bài tìm gia sư không có tìm theo từ khóa (mô tả có thể chứa thông tin của trẻ).
 */
export class AddMarketplaceSearch1794970900000 implements MigrationInterface {
  name = 'AddMarketplaceSearch1794970900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const randomCode = `substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)`;

    await queryRunner.query(`
      ALTER TABLE tutor_profiles
        ADD COLUMN public_code text NOT NULL DEFAULT ${randomCode},
        ADD CONSTRAINT tutor_profiles_public_code_chk CHECK (public_code ~ '^[0-9a-f]{10}$'),
        ADD CONSTRAINT tutor_profiles_public_code_uq UNIQUE (public_code),
        ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('simple', immutable_unaccent(lower(
            coalesce(headline, '') || ' ' || coalesce(bio, '') || ' ' ||
            coalesce(institution, '') || ' ' || coalesce(major, '') || ' ' ||
            coalesce(highest_education, '') || ' ' || coalesce(teaching_method, '') || ' ' ||
            coalesce(achievements, '')
          )))
        ) STORED
    `);
    await queryRunner.query(
      `CREATE INDEX tutor_profiles_search_idx ON tutor_profiles USING gin (search_vector)`,
    );

    await queryRunner.query(`
      ALTER TABLE tutor_posts
        ADD COLUMN public_code text NOT NULL DEFAULT ${randomCode},
        ADD CONSTRAINT tutor_posts_public_code_chk CHECK (public_code ~ '^[0-9a-f]{10}$'),
        ADD CONSTRAINT tutor_posts_public_code_uq UNIQUE (public_code),
        ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('simple', immutable_unaccent(lower(title || ' ' || description)))
        ) STORED
    `);
    await queryRunner.query(
      `CREATE INDEX tutor_posts_search_idx ON tutor_posts USING gin (search_vector)`,
    );

    // Tìm gia sư theo tên hiển thị, không dấu, `LIKE '%…%'`.
    await queryRunner.query(`
      CREATE INDEX users_display_name_trgm_idx ON users
        USING gin ((immutable_unaccent(lower(display_name))) gin_trgm_ops)
    `);

    // Thứ tự mặc định của tìm gia sư khi không có từ khóa (đọc theo index thay vì sắp xếp mọi gia sư). Kiểm bằng
    // EXPLAIN ANALYZE với 30 000 gia sư: 34 ms -> 0,8 ms.
    await queryRunner.query(`
      CREATE INDEX tutor_profiles_ranking_idx ON tutor_profiles (
        accepting_students DESC, has_verified_degree DESC, rating_avg DESC NULLS LAST,
        experience_years DESC NULLS LAST, updated_at DESC, user_id
      ) WHERE profile_status = 'verified'
    `);
    // Danh sách nhu cầu mới nhất khi gia sư chưa lọc (request_posts_search_idx bắt đầu bằng môn nên không dùng
    // được). 60 000 bài: 13 ms -> 0,8 ms.
    await queryRunner.query(`
      CREATE INDEX request_posts_open_idx ON request_posts (published_at DESC, id DESC)
        WHERE status = 'open' AND deleted_at IS NULL AND moderation_hidden_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX request_posts_open_idx`);
    await queryRunner.query(`DROP INDEX tutor_profiles_ranking_idx`);
    await queryRunner.query(`DROP INDEX users_display_name_trgm_idx`);
    await queryRunner.query(`DROP INDEX tutor_posts_search_idx`);
    await queryRunner.query(`
      ALTER TABLE tutor_posts
        DROP COLUMN search_vector,
        DROP CONSTRAINT tutor_posts_public_code_uq,
        DROP CONSTRAINT tutor_posts_public_code_chk,
        DROP COLUMN public_code
    `);
    await queryRunner.query(`DROP INDEX tutor_profiles_search_idx`);
    await queryRunner.query(`
      ALTER TABLE tutor_profiles
        DROP COLUMN search_vector,
        DROP CONSTRAINT tutor_profiles_public_code_uq,
        DROP CONSTRAINT tutor_profiles_public_code_chk,
        DROP COLUMN public_code
    `);
  }
}
