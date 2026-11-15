// Các bảng con thuần túy của hồ sơ gia sư: môn × khối, khu vực dạy trực tiếp, lịch rảnh theo tuần.
// Lưu lại toàn bộ mỗi lần gia sư lưu hồ sơ (xóa rồi thêm trong cùng transaction).
import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/** `tutor_teaching_subjects`: môn × khối lớp dạy được. */
@Entity({ name: 'tutor_teaching_subjects' })
export class TutorTeachingSubject {
  @PrimaryColumn({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @PrimaryColumn({ name: 'subject_id', type: 'integer' })
  subjectId!: number;

  @PrimaryColumn({ name: 'grade_level_id', type: 'integer' })
  gradeLevelId!: number;
}

/** `tutor_service_areas`: tỉnh hoặc xã có thể dạy trực tiếp. */
@Entity({ name: 'tutor_service_areas' })
export class TutorServiceArea {
  @PrimaryColumn({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  @PrimaryColumn({ name: 'area_id', type: 'integer' })
  areaId!: number;
}

/** `tutor_availability_slots`: khung giờ rảnh trong tuần (giờ Việt Nam). */
@Entity({ name: 'tutor_availability_slots' })
export class TutorAvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tutor_id', type: 'uuid' })
  tutorId!: string;

  /** ISO: 1 = thứ Hai … 7 = Chủ nhật. */
  @Column({ type: 'smallint' })
  weekday!: number;

  /** `time`: chuỗi HH:MM:SS. */
  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;
}
