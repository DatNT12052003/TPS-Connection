import { DataSource } from 'typeorm';
import { SubjectEntity } from '../modules/catalog/subject.entity.js';
import { Foundation1730000000000 } from './migrations/1730000000000-foundation.js';

export const createDataSource = (url: string) =>
  new DataSource({
    type: 'postgres',
    url,
    entities: [SubjectEntity],
    migrations: [Foundation1730000000000],
    migrationsTableName: 'schema_migrations',
    // The schema changes only through explicit migrations.
    synchronize: false,
    logging: false,
  });
