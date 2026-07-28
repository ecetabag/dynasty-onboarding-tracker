import { neon } from '@neondatabase/serverless';

let cachedSql = null;

export function getSql() {
  if (cachedSql) return cachedSql;

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('Database is not configured. Add DATABASE_URL or POSTGRES_URL in Vercel.');
  }

  cachedSql = neon(connectionString);
  return cachedSql;
}

export function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}
