// landing-page/src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import db from '../../../utils/db'; // Your database utility if needed for more complex user/installation validation

// For production, this should be a strong, randomly generated secret
// stored securely in your environment variables (e.g., on Vercel).
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_dev_only'; // CHANGE THIS FOR PROD!

export async function POST(req: NextRequest) {
	try {
		const { installation_id } = await req.json();

		if (!installation_id || typeof installation_id !== 'string') {
			return NextResponse.json({ message: 'installation_id is required' }, { status: 400 });
		}

		// --- Basic Validation/Registration (Optional, can be expanded) ---
		// You could check if the installation_id exists in a database of known installations
		// For simplicity, here we'll just generate a token for any unique ID.
		// In a real system, you might register an installation ID when the app is first
		// installed and send a unique key to the client, which is then used here.
		// This current setup allows any client with a UUID to get a token.
		// If you want to limit it, you'd add database lookups here.
		// Example:
		// const existingInstallation = await db.query('SELECT id FROM installations WHERE installation_id = $1', [installation_id]);
		// if (existingInstallation.rows.length === 0) {
		//     // Optionally register new installation or reject unknown ones
		//     await db.query('INSERT INTO installations (installation_id, created_at) VALUES ($1, NOW())', [installation_id]);
		// }
		// --- End Basic Validation ---


		// Generate a JWT token
		// The payload can include the installation_id and any other relevant data.
		// Set an expiration time (e.g., 24 hours).
		const token = jwt.sign({ installation_id: installation_id }, JWT_SECRET, { expiresIn: '24h' });

		return NextResponse.json({ token }, { status: 200 });

	} catch (error: any) {
		console.error('Error in auth endpoint:', error);
		return NextResponse.json(
			{ message: 'Internal Server Error', error: error.message },
			{ status: 500 }
		);
	}
}