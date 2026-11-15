import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Hồ sơ phụ huynh (`parent_profiles`), 1-1 với `users`. Địa chỉ là riêng tư, chỉ trả cho chính phụ huynh. */
@Entity({ name: 'parent_profiles' })
export class ParentProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'province_id', type: 'integer', nullable: true })
  provinceId!: number | null;

  @Column({ name: 'commune_id', type: 'integer', nullable: true })
  communeId!: number | null;

  @Column({ name: 'address_line', type: 'text', nullable: true })
  addressLine!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
