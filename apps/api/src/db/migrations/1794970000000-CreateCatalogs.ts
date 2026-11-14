import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Danh mục: môn học, khối lớp, đơn vị hành chính (docs/thiet_ke_co_so_du_lieu.md mục 3).
 * Seed sẵn môn học và khối lớp (mã được code tham chiếu; Admin sửa tên, ẩn/hiện về sau).
 * Đơn vị hành chính nạp bằng `npm run db:seed:areas` (nguồn cập nhật định kỳ, D42–D44).
 */
export class CreateCatalogs1794970000000 implements MigrationInterface {
  name = 'CreateCatalogs1794970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE subjects (
        id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code        text        NOT NULL,
        parent_id   integer     REFERENCES subjects (id),
        name_vi     text        NOT NULL,
        name_en     text        NOT NULL,
        sort_order  integer     NOT NULL DEFAULT 0,
        is_active   boolean     NOT NULL DEFAULT true,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT subjects_code_uq UNIQUE (code),
        CONSTRAINT subjects_code_format_chk CHECK (code ~ '^[a-z][a-z0-9_]*$'),
        CONSTRAINT subjects_not_own_parent_chk CHECK (parent_id IS DISTINCT FROM id)
      )
    `);
    await queryRunner.query(`CREATE INDEX subjects_parent_idx ON subjects (parent_id)`);

    await queryRunner.query(`
      CREATE TABLE grade_levels (
        id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code        text        NOT NULL,
        stage       text        NOT NULL,
        name_vi     text        NOT NULL,
        name_en     text        NOT NULL,
        sort_order  integer     NOT NULL DEFAULT 0,
        is_active   boolean     NOT NULL DEFAULT true,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT grade_levels_code_uq UNIQUE (code),
        CONSTRAINT grade_levels_stage_chk CHECK (stage IN ('preschool', 'primary', 'lower_secondary',
          'upper_secondary', 'university', 'working_adult', 'other'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE administrative_areas (
        id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        code         text          NOT NULL,
        level        text          NOT NULL,
        unit_type    text          NOT NULL,
        parent_id    integer       REFERENCES administrative_areas (id),
        name         text          NOT NULL,
        full_name    text          NOT NULL,
        name_en      text,
        name_ascii   text          NOT NULL,
        postal_code  text,
        latitude     numeric(9, 6),
        longitude    numeric(9, 6),
        is_active    boolean       NOT NULL DEFAULT true,
        valid_from   date,
        valid_to     date,
        created_at   timestamptz   NOT NULL DEFAULT now(),
        updated_at   timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT administrative_areas_code_uq UNIQUE (code),
        CONSTRAINT administrative_areas_level_chk CHECK (level IN ('province', 'commune')),
        CONSTRAINT administrative_areas_unit_type_chk CHECK (unit_type IN ('province', 'municipality',
          'commune', 'ward', 'special_zone')),
        CONSTRAINT administrative_areas_parent_chk CHECK ((level = 'province') = (parent_id IS NULL)),
        CONSTRAINT administrative_areas_unit_level_chk
          CHECK ((level = 'province') = (unit_type IN ('province', 'municipality'))),
        CONSTRAINT administrative_areas_code_format_chk
          CHECK ((level = 'province' AND code ~ '^[0-9]{2}$') OR (level = 'commune' AND code ~ '^[0-9]{5}$'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX administrative_areas_parent_idx ON administrative_areas (parent_id) WHERE is_active`,
    );

    await seedGradeLevels(queryRunner);
    await seedSubjects(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE administrative_areas`);
    await queryRunner.query(`DROP TABLE grade_levels`);
    await queryRunner.query(`DROP TABLE subjects`);
  }
}

// ---- Dữ liệu ban đầu (bản chụp tại thời điểm viết migration; sửa về sau qua trang quản trị) ----

const GRADE_LEVELS: [code: string, stage: string, vi: string, en: string][] = [
  ['preschool', 'preschool', 'Mầm non', 'Preschool'],
  ...Array.from({ length: 12 }, (_, i): [string, string, string, string] => {
    const grade = i + 1;
    const stage = grade <= 5 ? 'primary' : grade <= 9 ? 'lower_secondary' : 'upper_secondary';
    return [`grade_${grade}`, stage, `Lớp ${grade}`, `Grade ${grade}`];
  }),
  ['university', 'university', 'Đại học', 'University'],
  ['working_adult', 'working_adult', 'Người đi làm', 'Working adult'],
];

async function seedGradeLevels(queryRunner: QueryRunner) {
  for (const [index, [code, stage, vi, en]] of GRADE_LEVELS.entries()) {
    await queryRunner.query(
      `INSERT INTO grade_levels (code, stage, name_vi, name_en, sort_order) VALUES ($1, $2, $3, $4, $5)`,
      [code, stage, vi, en, (index + 1) * 10],
    );
  }
}

/** Nhóm môn (dòng cha, không chọn trực tiếp) và các môn trong nhóm. */
const SUBJECT_GROUPS: {
  code: string;
  vi: string;
  en: string;
  subjects: [code: string, vi: string, en: string][];
}[] = [
  {
    code: 'group_sciences',
    vi: 'Tự nhiên',
    en: 'Sciences',
    subjects: [
      ['math', 'Toán', 'Mathematics'],
      ['physics', 'Vật lý', 'Physics'],
      ['chemistry', 'Hóa học', 'Chemistry'],
      ['biology', 'Sinh học', 'Biology'],
      ['natural_science', 'Khoa học tự nhiên', 'Natural science'],
      ['science', 'Khoa học', 'Science'],
    ],
  },
  {
    code: 'group_humanities',
    vi: 'Xã hội',
    en: 'Humanities',
    subjects: [
      ['vietnamese', 'Tiếng Việt', 'Vietnamese'],
      ['literature', 'Ngữ văn', 'Literature'],
      ['history', 'Lịch sử', 'History'],
      ['geography', 'Địa lý', 'Geography'],
      ['history_geography', 'Lịch sử và Địa lý', 'History and geography'],
      ['civics', 'Giáo dục kinh tế và pháp luật', 'Economics and law'],
    ],
  },
  {
    code: 'group_languages',
    vi: 'Ngoại ngữ',
    en: 'Foreign languages',
    subjects: [
      ['english', 'Tiếng Anh', 'English'],
      ['chinese', 'Tiếng Trung', 'Chinese'],
      ['japanese', 'Tiếng Nhật', 'Japanese'],
      ['korean', 'Tiếng Hàn', 'Korean'],
      ['french', 'Tiếng Pháp', 'French'],
    ],
  },
  {
    code: 'group_computing',
    vi: 'Tin học',
    en: 'Computing',
    subjects: [
      ['informatics', 'Tin học', 'Informatics'],
      ['programming', 'Lập trình', 'Programming'],
    ],
  },
  {
    code: 'group_arts',
    vi: 'Năng khiếu',
    en: 'Arts',
    subjects: [
      ['drawing', 'Vẽ', 'Drawing'],
      ['piano', 'Piano', 'Piano'],
      ['guitar', 'Guitar', 'Guitar'],
      ['singing', 'Thanh nhạc', 'Singing'],
    ],
  },
  {
    code: 'group_skills',
    vi: 'Kỹ năng',
    en: 'Skills',
    subjects: [
      ['handwriting', 'Luyện chữ', 'Handwriting'],
      ['school_readiness', 'Chuẩn bị vào lớp 1', 'School readiness'],
    ],
  },
];

async function seedSubjects(queryRunner: QueryRunner) {
  for (const [groupIndex, group] of SUBJECT_GROUPS.entries()) {
    const groupOrder = (groupIndex + 1) * 100;
    const [{ id }] = (await queryRunner.query(
      `INSERT INTO subjects (code, name_vi, name_en, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
      [group.code, group.vi, group.en, groupOrder],
    )) as [{ id: number }];
    for (const [index, [code, vi, en]] of group.subjects.entries()) {
      await queryRunner.query(
        `INSERT INTO subjects (code, parent_id, name_vi, name_en, sort_order) VALUES ($1, $2, $3, $4, $5)`,
        [code, id, vi, en, groupOrder + (index + 1) * 10],
      );
    }
  }
}
