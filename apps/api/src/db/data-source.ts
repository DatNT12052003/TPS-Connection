import { DataSource } from 'typeorm';
import { SubjectEntity } from '../modules/catalog/subject.entity.js';
import { Foundation1730000000000 } from './migrations/1730000000000-foundation.js';
import { Accounts1730000000001 } from './migrations/1730000000001-accounts.js';
import { Profiles1730000000002 } from './migrations/1730000000002-profiles.js';
import { TutorProfiles1730000000003 } from './migrations/1730000000003-tutor-profiles.js';

export const createDataSource = (url: string) =>
  new DataSource({
    type: 'postgres',
    url,
    entities: [SubjectEntity],
    migrations: [
      Foundation1730000000000,
      Accounts1730000000001,
      Profiles1730000000002,
      TutorProfiles1730000000003,
    ],
    migrationsTableName: 'schema_migrations',
    // The schema changes only through explicit migrations.
    synchronize: false,
    logging: false,
  });
