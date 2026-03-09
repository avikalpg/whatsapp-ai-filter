import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// Extend the global object to store the connection pool.
// This ensures that in development (with hot reloading) and in production
// (in serverless functions that may persist across invocations),
// only one connection pool is created.
declare global {
  var _dbConnection: Pool | undefined;
  /** Cached migration promise — shared across concurrent cold-start requests. */
  var _dbMigrationPromise: Promise<void> | undefined;
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
 *
 * Stores the in-flight Promise in a global so concurrent requests that arrive
 * during the first migration all await the *same* promise rather than each
 * seeing a stale boolean flag and racing past it.
 *
 * On failure the promise is cleared so the next request retries cleanly.
 */
function migrate(): Promise<void> {
  if (!global._dbMigrationPromise) {
    global._dbMigrationPromise = (async () => {
      try {
        const sqlPath = path.join(process.cwd(), 'db', 'setup.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await conn.query(sql);
      } catch (err) {
        // Clear so the next request retries (e.g. transient DB unavailability)
        global._dbMigrationPromise = undefined;
        console.error('[db] Migration failed:', err);
        throw err;
      }
    })();
  }
  return global._dbMigrationPromise;
}

// Wrap the pool so every first query triggers the migration transparently.
// After the first successful migration, subsequent calls skip straight to the query.
const db = {
  async query<T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<import('pg').QueryResult<T>> {
    await migrate();
    return conn.query<T>(text, params);
  },
};

export default db;
