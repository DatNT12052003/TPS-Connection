import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Ghi nhớ đăng nhập": khi xoay refresh token, token mới phải giữ cùng kiểu phiên (cookie bền 30 ngày hay
 * cookie phiên 12 giờ), nên lưu lựa chọn này trên từng dòng của chuỗi token.
 */
export class AddAuthSessionRememberMe1794970200000 implements MigrationInterface {
  name = 'AddAuthSessionRememberMe1794970200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE auth_sessions ADD COLUMN remember_me boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE auth_sessions DROP COLUMN remember_me`);
  }
}
