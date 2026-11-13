import type { AdministrativeLevel, AdministrativeUnitType } from '@tps/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Đơn vị hành chính hai cấp tỉnh – xã (`administrative_areas`). `code` là mã chính thức, ổn định khi đổi tên
 * hoặc đổi loại. Đơn vị bị sáp nhập/chia tách không xóa mà `isActive = false` (docs/danh_muc_hanh_chinh.md).
 */
@Entity({ name: 'administrative_areas' })
export class AdministrativeArea {
  @PrimaryGeneratedColumn('identity', { type: 'integer', generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  level!: AdministrativeLevel;

  @Column({ name: 'unit_type', type: 'text' })
  unitType!: AdministrativeUnitType;

  @Column({ name: 'parent_id', type: 'integer', nullable: true })
  parentId!: number | null;

  /** Tên ngắn, ví dụ "Ba Đình". */
  @Column({ type: 'text' })
  name!: string;

  /** Tên kèm loại đơn vị, ví dụ "Phường Ba Đình". */
  @Column({ name: 'full_name', type: 'text' })
  fullName!: string;

  @Column({ name: 'name_en', type: 'text', nullable: true })
  nameEn!: string | null;

  /** Tên không dấu, để tìm kiếm. */
  @Column({ name: 'name_ascii', type: 'text' })
  nameAscii!: string;

  @Column({ name: 'postal_code', type: 'text', nullable: true })
  postalCode!: string | null;

  /** numeric(9,6): driver pg trả về chuỗi để không mất độ chính xác. */
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  latitude!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  longitude!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom!: string | null;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
