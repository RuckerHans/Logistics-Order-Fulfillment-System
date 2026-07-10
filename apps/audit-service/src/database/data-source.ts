import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { entities } from './entities';

config();

// Used only by the TypeORM CLI (migration:generate/run/revert) — connects as
// audit_migrator (USAGE + CREATE), never as the app's own DATABASE_URL role.
const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.MIGRATION_DATABASE_URL,
  // audit_migrator only has CREATE on the audit schema, not public — scope
  // TypeORM's own bookkeeping "migrations" table there too.
  schema: 'audit',
  entities,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});

export default AppDataSource;
