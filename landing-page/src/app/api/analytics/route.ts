import { NextRequest, NextResponse } from 'next/server';
import db from '../../../utils/db';

export async function POST(req: NextRequest) {
	const analyticsData = await req.json();

	const installationId = (typeof analyticsData.installation_id === 'string') ? analyticsData.installation_id.trim() : '';

	// Basic validation (you'll want more robust validation here)
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!installationId || !uuidRegex.test(installationId) || analyticsData.messages_analyzed_count === undefined) {
		console.error('Invalid installation_id or analytics data:', {
			installationId,
			analyticsData
		});
		return NextResponse.json({ message: 'Missing or invalid installation_id or analytics data' }, { status: 400 });
	}

	try {
		// Example INSERT statement (adjust column names to match your schema precisely)
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
				analyticsData.ai_provider_message_counts,
				analyticsData.ai_api_latency_ms,
				analyticsData.ai_api_success_counts,
				analyticsData.ai_api_failure_counts
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