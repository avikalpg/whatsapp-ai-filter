import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// Extend the global object to store the connection pool.
// This ensures that in development (with hot reloading) and in production
// (in serverless functions that may persist across invocations),
// only one connection pool is created.
declare global {
  var _dbConnection: Pool | undefined;
  var _dbMigrated: boolean | undefined;
}

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // required for Neon's default self-signed cert
  });
}

let conn: Pool;

if (process.env.NODE_ENV === 'production') {
  conn = createPool();
} else {
  // Preserve pool across hot reloads in development
  if (!global._dbConnection) {
    global._dbConnection = createPool();
  }
  conn = global._dbConnection;
}

/**
 * Run db/setup.sql exactly once per process lifetime.
 * Every statement uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS,
 * so concurrent cold-starts are safe and repeated calls are no-ops.
 */
async function migrate(): Promise<void> {
  if (global._dbMigrated) return;
  global._dbMigrated = true; // optimistic — prevents parallel cold-start races

  try {
    const sqlPath = path.join(process.cwd(), 'db', 'setup.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await conn.query(sql);
  } catch (err) {
    // Reset flag so the next request retries (e.g. transient DB unavailability)
    global._dbMigrated = false;
    console.error('[db] Migration failed:', err);
    throw err;
  }
}

// Wrap the pool so every first query triggers the migration transparently.
// After the first successful migration, subsequent calls skip straight to the query.
const db = {
  async query<T extends object = object>(
    text: string,
    params?: unknown[]
  ): Promise<import('pg').QueryResult<T>> {
    await migrate();
    return conn.query<T>(text, params);
  },
};

export default db;
