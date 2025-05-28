import { NextRequest, NextResponse } from 'next/server';
import db from '../../../utils/db'; // Your database utility
import jwt from 'jsonwebtoken'; // You'll need to install this: npm install jsonwebtoken

// Ensure you have a JWT secret in your environment variables for production!
// For development, you can use a placeholder, but NEVER expose it in client-side code.
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_dev_only'; // CHANGE THIS FOR PROD!

export async function POST(req: NextRequest) {
	// 1. Authentication: Verify the JWT token
	const authHeader = req.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return NextResponse.json({ message: 'Authorization token required' }, { status: 401 });
	}

	const token = authHeader.split(' ')[1];
	const analyticsData = await req.json();
	const installationId = (typeof analyticsData.installation_id === 'string') ? analyticsData.installation_id.trim() : '';

	let decodedToken: any;
	try {
		decodedToken = jwt.verify(token, JWT_SECRET);
		if (!decodedToken.installation_id || decodedToken.installation_id !== installationId) {
			console.error('installation_id mismatch between token and payload', {
				tokenInstallationId: decodedToken.installation_id,
				payloadInstallationId: installationId
			});
			return NextResponse.json({ message: 'installation_id mismatch between token and payload' }, { status: 403 });
		}
	} catch (error) {
		console.error('JWT verification failed:', error);
		return NextResponse.json({ message: 'Invalid or expired token' }, { status: 403 });
	}

	// 2. Process Analytics Data (after authentication)
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!installationId || !uuidRegex.test(installationId) || analyticsData.messages_analyzed_count === undefined) {
		console.error('Invalid installation_id or analytics data:', {
			installationId,
			analyticsData
		});
		return NextResponse.json({ message: 'Missing or invalid installation_id or analytics data' }, { status: 400 });
	}

	// Optional: Add more validation here (e.g., check types, ranges) for other fields

	try {
		const result = await db.query(
			`INSERT INTO analytics (
                installation_id, recorded_at, app_version, node_version, os_platform,
                is_running_with_pm2, uptime_seconds_since_last_heartbeat,
                messages_analyzed_count, messages_relevant_count, ai_provider_message_counts,
                ai_api_latency_ms, ai_api_success_counts, ai_api_failure_counts
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            ) RETURNING id`,
			[
				installationId,
				analyticsData.recorded_at || new Date().toISOString(),
				analyticsData.app_version,
				analyticsData.node_version,
				analyticsData.os_platform,
				analyticsData.is_running_with_pm2,
				analyticsData.uptime_seconds_since_last_heartbeat,
				analyticsData.messages_analyzed_count,
				analyticsData.messages_relevant_count,
				analyticsData.ai_provider_message_counts || {},
				analyticsData.ai_api_latency_ms || {},
				analyticsData.ai_api_success_counts || {},
				analyticsData.ai_api_failure_counts || {}
			]
		);

		return NextResponse.json(
			{ message: 'Analytics data received and stored', id: result.rows[0].id },
			{ status: 200 }
		);
	} catch (error: any) {
		console.error('Error inserting analytics data:', error);
		return NextResponse.json(
			{ message: 'Internal Server Error', error: error.message },
			{ status: 500 }
		);
	}
}