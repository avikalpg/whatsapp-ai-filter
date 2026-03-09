import { Pool } from 'pg';

// Extend the global object to store the connection pool.
// This ensures that in development (with hot reloading) and in production
// (in serverless functions that may persist across invocations),
// only one connection pool is created.
declare global {
  var _dbConnection: Pool | undefined;
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

export default conn;
