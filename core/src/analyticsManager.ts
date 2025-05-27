// core/src/analyticsManager.ts
import * as fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

// Get the current file's path in ESM
const __filename = fileURLToPath(import.meta.url);
// Get the current directory's path in ESM
const __dirname = path.dirname(__filename);

// Correct path resolution:
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function ensureDataDir() {
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
	}
}

// Define the structure of your analytics data stored locally in analytics.json
interface LocalAnalyticsConfig {
	analytics_enabled: boolean;
	installation_id?: string; // Optional because it might not exist initially
	// Any other configuration that needs to be persisted locally
}

// Define the structure of the in-memory metrics cache
// This is where you'll aggregate data between sending intervals
interface AnalyticsMetrics {
	messages_analyzed_count: number;
	messages_relevant_count: number;
	ai_provider_message_counts: { [key: string]: number }; // e.g., {"perplexity": 100, "openai": 50}
	ai_api_latency_ms: { [key: string]: { total: number; count: number } }; // To calculate average latency
	ai_api_success_counts: { [key: string]: number };
	ai_api_failure_counts: { [key: string]: number };
	// uptime_seconds_since_last_heartbeat will be calculated dynamically before sending
}

// Define the path to analytics.json relative to the compiled JS file
const ANALYTICS_FILE_PATH = path.join(DATA_DIR, 'analytics.json');

// Global variables for the current configuration and in-memory metrics
let localConfig: LocalAnalyticsConfig = { analytics_enabled: true };
let metricsCache: AnalyticsMetrics = initializeEmptyMetrics();

/**
 * Initializes an empty metrics cache.
 * Call this to reset metrics after sending.
 */
function initializeEmptyMetrics(): AnalyticsMetrics {
	return {
		messages_analyzed_count: 0,
		messages_relevant_count: 0,
		ai_provider_message_counts: {},
		ai_api_latency_ms: {},
		ai_api_success_counts: {},
		ai_api_failure_counts: {},
	};
}

/**
 * Loads analytics configuration from analytics.json and determines final analytics_enabled state.
 * Generates installation_id if enabled and missing.
 */
async function loadAnalyticsConfig(): Promise<void> {
	try {
		const fileContent = await fs.promises.readFile(ANALYTICS_FILE_PATH, 'utf8');
		localConfig = JSON.parse(fileContent);
		console.log('[Analytics Manager] Loaded existing analytics config from analytics.json.');
	} catch (error: any) {
		if (error.code === 'ENOENT') {
			console.log('[Analytics Manager] analytics.json not found. Will create default config.');
			// File doesn't exist, localConfig remains default, which will be saved later
		} else {
			console.error('[Analytics Manager] Error loading analytics.json:', error);
			// Fallback to default localConfig on other errors
		}
	}

	// Determine final analytics_enabled state based on .env preference first
	const envAnalyticsEnabled = process.env.ANALYTICS_ENABLED;

	// If .env var is explicitly "false", override. Otherwise, use what's in localConfig or default to true.
	if (envAnalyticsEnabled === 'false') {
		localConfig.analytics_enabled = false;
	} else if (envAnalyticsEnabled === 'true' || envAnalyticsEnabled === undefined) { // Default to true if env var is missing or true
		localConfig.analytics_enabled = true;
	}

	// If analytics are now enabled and installation_id is missing, generate one
	if (localConfig.analytics_enabled && !localConfig.installation_id) {
		localConfig.installation_id = uuidv4();
		console.log('[Analytics Manager] Generated new installation_id.');
	}

	await saveAnalyticsConfig();
}

/**
 * Saves the current analytics configuration to analytics.json.
 */
async function saveAnalyticsConfig(): Promise<void> {
	try {
		await fs.promises.writeFile(ANALYTICS_FILE_PATH, JSON.stringify(localConfig, null, 2), 'utf8');
		console.log('[Analytics Manager] Saved analytics config to analytics.json.');
	} catch (error) {
		console.error('[Analytics Manager] Error saving analytics config:', error);
	}
}

// The main analyticsManager object that will be imported and used
export const analyticsManager = {
	/**
	 * Initializes the analytics manager. Should be called once at application startup.
	 */
	async init() {
		ensureDataDir();
		await loadAnalyticsConfig();
	},

	/**
	 * Checks if analytics collection is currently enabled.
	 */
	isEnabled(): boolean {
		return localConfig.analytics_enabled;
	},

	/**
	 * Gets the unique installation ID. Returns undefined if not enabled or not generated yet.
	 */
	getInstallationId(): string | undefined {
		return localConfig.installation_id;
	},

	/**
	 * Increments the count of messages analyzed.
	 */
	incrementMessagesAnalyzed(count: number = 1) {
		if (localConfig.analytics_enabled) {
			metricsCache.messages_analyzed_count += count;
		}
	},

	/**
	 * Increments the count of messages deemed relevant.
	 */
	incrementMessagesRelevant(count: number = 1) {
		if (localConfig.analytics_enabled) {
			metricsCache.messages_relevant_count += count;
		}
	},

	/**
	 * Records a message count for a specific AI provider.
	 */
	addAiProviderMessageCount(provider: string, count: number = 1) {
		if (localConfig.analytics_enabled) {
			metricsCache.ai_provider_message_counts[provider] = (metricsCache.ai_provider_message_counts[provider] || 0) + count;
		}
	},

	/**
	 * Records AI API latency for a specific provider.
	 */
	recordAiApiLatency(provider: string, latencyMs: number) {
		if (localConfig.analytics_enabled) {
			metricsCache.ai_api_latency_ms[provider] = metricsCache.ai_api_latency_ms[provider] || { total: 0, count: 0 };
			metricsCache.ai_api_latency_ms[provider].total += latencyMs;
			metricsCache.ai_api_latency_ms[provider].count += 1;
		}
	},

	/**
	 * Increments the success count for a specific AI API provider.
	 */
	incrementAiApiSuccess(provider: string, count: number = 1) {
		if (localConfig.analytics_enabled) {
			metricsCache.ai_api_success_counts[provider] = (metricsCache.ai_api_success_counts[provider] || 0) + count;
		}
	},

	/**
	 * Increments the failure count for a specific AI API provider.
	 */
	incrementAiApiFailure(provider: string, count: number = 1) {
		if (localConfig.analytics_enabled) {
			metricsCache.ai_api_failure_counts[provider] = (metricsCache.ai_api_failure_counts[provider] || 0) + count;
		}
	},

	/**
	 * Retrieves current metrics, calculates averages (e.g., latency), and resets the cache.
	 * This method is intended to be called when data is about to be sent.
	 */
	getAndResetMetrics(): AnalyticsMetrics | null {
		if (!localConfig.analytics_enabled) {
			return null; // Don't return metrics if analytics are disabled
		}

		const currentMetrics = { ...metricsCache }; // Create a shallow copy

		// Calculate average latencies from total and count
		const averagedLatencies: { [key: string]: number } = {};
		for (const provider in currentMetrics.ai_api_latency_ms) {
			const data = currentMetrics.ai_api_latency_ms[provider];
			if (data.count > 0) {
				averagedLatencies[provider] = parseFloat((data.total / data.count).toFixed(2)); // Average to 2 decimal places
			} else {
				averagedLatencies[provider] = 0; // No calls, so 0 latency
			}
		}
		// Overwrite the original total/count structure with averaged values
		(currentMetrics as any).ai_api_latency_ms = averagedLatencies;

		metricsCache = initializeEmptyMetrics(); // Reset cache for next reporting period
		return currentMetrics;
	},

	// TODO: Method to save current metrics to data/analytics.json (optional, for robustness)
	// This is a more advanced persistence layer, typically for ensuring no data loss on crash.
	// For now, we only save the config (installation_id, analytics_enabled).
	// Full persistence of metrics would require a separate mechanism if not sent frequently.
};