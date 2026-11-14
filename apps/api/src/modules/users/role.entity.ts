import type { Role as RoleCode } from '@tps/shared';
import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Vai trò (`roles`), seed trong migration; mã khớp với `Role` của @tps/shared. */
@Entity({ name: 'roles' })
export class Role {
  @PrimaryColumn({ type: 'text' })
  code!: RoleCode;

  @Column({ name: 'name_vi', type: 'text' })
  nameVi!: string;

  @Column({ name: 'name_en', type: 'text' })
  nameEn!: string;

  /** manager, admin: nhân viên vận hành. */
  @Column({ name: 'is_staff', type: 'boolean', default: false })
  isStaff!: boolean;
}
