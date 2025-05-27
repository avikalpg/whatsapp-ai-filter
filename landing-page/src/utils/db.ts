import { Pool } from 'pg';

// Extend the global object to store the connection pool
// This ensures that in development (with hot reloading) and in production
// (in serverless functions that might persist across invocations),
// only one connection pool is created.
declare global {
	var _dbConnection: Pool | undefined;
}

let conn: Pool;

if (process.env.NODE_ENV === 'production') {
	conn = new Pool({
		connectionString: process.env.DATABASE_URL,
		ssl: {
			rejectUnauthorized: false, // Required for Neon if using default self-signed cert
		},
	});
} else {
	// In development, store the connection in a global variable to preserve it across hot reloads
	if (!global._dbConnection) {
		global._dbConnection = new Pool({
			connectionString: process.env.DATABASE_URL,
			ssl: {
				rejectUnauthorized: false,
			},
		});
	}
	conn = global._dbConnection;
}

export default conn;