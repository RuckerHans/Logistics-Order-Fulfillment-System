import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { entities } from './entities';

config();

// Used only by the TypeORM CLI (migration:generate/run/revert) — connects as
// order_api_migrator (USAGE + CREATE), never as the app's own DATABASE_URL role.
const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.MIGRATION_DATABASE_URL,
  // order_api_migrator only has CREATE on the order_api schema, not on
  // public (Postgres 15+ no longer grants CREATE on public by default) —
  // scope TypeORM's own bookkeeping "migrations" table into order_api too.
  schema: 'order_api',
  entities,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});

export default AppDataSource;
