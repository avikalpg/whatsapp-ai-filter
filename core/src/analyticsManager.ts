// core/src/analyticsManager.ts
import * as fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { ANALYTICS_BASE_URL } from './config/env.js';

// Get the current file's path in ESM
const __filename = fileURLToPath(import.meta.url);
// Get the current directory's path in ESM
const __dirname = path.dirname(__filename);

// Correct path resolution:
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ROOT_DIR = path.join(__dirname, '..', '..');

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
}

interface AuthTokenResponse {
	token: string;
}

// Define the path to analytics.json relative to the compiled JS file
const ANALYTICS_FILE_PATH = path.join(DATA_DIR, 'analytics.json');

// Global variables for the current configuration and in-memory metrics
let localConfig: LocalAnalyticsConfig = { analytics_enabled: true };
let metricsCache: AnalyticsMetrics = initializeEmptyMetrics();

// Keep track of application start time for uptime calculation
const APP_START_TIME = Date.now();

/**
 * Reads the application version from package.json.
 */
function getAppVersion(): string | undefined {
	try {
		const packageJsonPath = path.join(ROOT_DIR, 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		return packageJson.version;
	} catch (error) {
		console.warn('[Analytics Manager] Could not read app version from package.json:', error);
		return undefined;
	}
}

/**
 * Checks if the application is likely running under PM2.
 */
function isRunningWithPM2(): boolean {
	return !!process.env.PM2_HOME || !!process.env.pm_id;
}

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

// Global variable to hold the setInterval ID for analytics sending
let sendingInterval: NodeJS.Timeout | null = null;
// Global variable to hold the authentication token
let authToken: string | null = null;
// Global variable to track if token fetching is in progress to avoid race conditions
let isFetchingToken: boolean = false;

// --- Analytics Configuration ---
// Fixed API paths relative to the base URL
const ANALYTICS_API_PATH = "/api/analytics";
const ANALYTICS_AUTH_PATH = "/api/auth";

// Construct the full endpoints using the base URL imported from env.ts
const ANALYTICS_API_ENDPOINT = `${ANALYTICS_BASE_URL}${ANALYTICS_API_PATH}`;
const ANALYTICS_AUTH_ENDPOINT = `${ANALYTICS_BASE_URL}${ANALYTICS_AUTH_PATH}`;

const ANALYTICS_SEND_INTERVAL_MS = 3600000; // 1 hour (3600000ms) - still hardcoded as it's a service parameter.


// The main analyticsManager object that will be imported and used
export const analyticsManager = {
	/**
	 * Initializes the analytics manager. Should be called once at application startup.
	 */
	async init() {
		ensureDataDir();
		await loadAnalyticsConfig();

		// Check if the analytics base URL is valid (should always be with hardcoded values)
		// This check remains useful if ANALYTICS_BASE_URL could ever be improperly derived/configured
		if (!ANALYTICS_BASE_URL || !ANALYTICS_BASE_URL.startsWith('http')) {
			console.error(`[Analytics Manager] Invalid ANALYTICS_BASE_URL derived: ${ANALYTICS_BASE_URL}. Analytics will not function.`);
			localConfig.analytics_enabled = false; // Disable if URL is bad
		}

		// If analytics are enabled, try to fetch auth token and start sending
		if (this.isEnabled()) {
			await this._fetchAuthToken(); // Attempt to get token on startup
			this.startSending();
		}
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

	// --- Authentication Method ---
	/**
	 * Fetches an authentication token from the analytics auth endpoint using the installation_id.
	 */
	async _fetchAuthToken(): Promise<boolean> {
		if (!this.isEnabled() || !localConfig.installation_id || isFetchingToken) {
			return false; // Don't fetch if disabled, no ID, or already fetching
		}

		isFetchingToken = true; // Set flag to true to prevent concurrent token fetches

		try {
			console.log(`[Analytics Manager] Fetching auth token for installation ID: ${localConfig.installation_id}...`);
			const response = await axios.post<AuthTokenResponse>(ANALYTICS_AUTH_ENDPOINT, {
				installation_id: localConfig.installation_id,
			}, {
				headers: {
					'Content-Type': 'application/json',
				},
			});

			if (response.status === 200 && response.data && response.data.token) {
				authToken = response.data.token;
				console.info('[Analytics Manager] Auth token fetched successfully.');
				return true;
			} else {
				console.error(`[Analytics Manager] Failed to fetch auth token: ${response.status} - ${JSON.stringify(response.data)}`);
				authToken = null;
				return false;
			}
		} catch (error: any) {
			if (axios.isAxiosError(error) && error.response) {
				console.error(`[Analytics Manager] Error fetching auth token: ${error.response.status} ${error.response.statusText} - ${JSON.stringify(error.response.data)}`);
			} else {
				console.error(`[Analytics Manager] Network error fetching auth token: ${error.message}`);
			}
			authToken = null;
			return false;
		} finally {
			isFetchingToken = false; // Reset flag
		}
	},

	// --- Analytics Sending Mechanism ---
	/**
	 * Sends the accumulated analytics metrics to the configured API endpoint.
	 */
	async sendMetrics() {
		if (!this.isEnabled()) {
			console.debug('[Analytics Manager] Analytics disabled, not sending metrics.');
			return;
		}

		if (!authToken) {
			console.warn('[Analytics Manager] No auth token available. Attempting to fetch a new one before sending metrics.');
			const tokenFetched = await this._fetchAuthToken();
			if (!tokenFetched) {
				console.error('[Analytics Manager] Failed to get auth token. Cannot send metrics.');
				return;
			}
		}

		const metricsToSend = this.getAndResetMetrics(); // Get current metrics and reset cache

		// Check if there are any metrics to send before making the API call
		// This handles cases where getAndResetMetrics might return null (if disabled)
		// or an empty object if no new metrics were collected in the interval.
		if (!metricsToSend) {
			console.debug('[Analytics Manager] No metrics to send (analytics disabled or getAndResetMetrics returned null).');
			return;
		}

		if (!hasMetrics(metricsToSend)) {
			console.debug('[Analytics Manager] No new analytics metrics to send (all zero/empty).');
			return;
		}

		const payload = {
			installation_id: localConfig.installation_id,
			recorded_at: new Date().toISOString(),
			app_version: getAppVersion(),
			node_version: process.version,
			os_platform: process.platform,
			is_running_with_pm2: isRunningWithPM2(),
			uptime_seconds_since_last_heartbeat: Math.floor((Date.now() - APP_START_TIME) / 1000),

			// Flatten the metrics from metricsToSend directly into the payload
			messages_analyzed_count: metricsToSend.messages_analyzed_count,
			messages_relevant_count: metricsToSend.messages_relevant_count,
			ai_provider_message_counts: metricsToSend.ai_provider_message_counts,
			ai_api_latency_ms: metricsToSend.ai_api_latency_ms,
			ai_api_success_counts: metricsToSend.ai_api_success_counts,
			ai_api_failure_counts: metricsToSend.ai_api_failure_counts,
		};

		try {
			console.log('[Analytics Manager] Sending analytics metrics...');
			const response = await axios.post(ANALYTICS_API_ENDPOINT, payload, {
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${authToken}`,
				},
			});

			if (response.status >= 200 && response.status < 300) {
				console.info('[Analytics Manager] Analytics metrics sent successfully!');
			} else {
				console.error(`[Analytics Manager] Failed to send analytics metrics (unexpected status): ${response.status} ${response.statusText} - ${JSON.stringify(response.data)}`);
			}
		} catch (error: any) {
			if (axios.isAxiosError(error) && error.response) {
				// If it's an unauthorized error, attempt to re-fetch token and retry (optional, for robustness)
				if (error.response.status === 401 && !isFetchingToken) {
					console.warn('[Analytics Manager] Auth token unauthorized (401). Attempting to re-fetch token and retry...');
					authToken = null; // Invalidate current token
					const tokenRefreshed = await this._fetchAuthToken();
					if (tokenRefreshed) {
						console.info('[Analytics Manager] Token re-fetched. Metrics will be sent in the next scheduled interval.');
						// To retry immediately, you could call this.sendMetrics() again here,
						// but be careful to avoid infinite loops if token re-fetch consistently fails.
					} else {
						console.error('[Analytics Manager] Failed to re-fetch token after 401. Metrics sending might be interrupted.');
					}
				}
				console.error(`[Analytics Manager] Error sending analytics metrics: ${error.response.status} ${error.response.statusText} - ${JSON.stringify(error.response.data)}`);
			} else {
				console.error(`[Analytics Manager] Network or generic error sending analytics metrics: ${error.message}`);
			}
		}
	},

	/**
	 * Starts the periodic sending of analytics metrics.
	 */
	startSending() {
		if (sendingInterval) {
			console.warn('[Analytics Manager] Analytics sending is already active.');
			return;
		}

		console.info(`[Analytics Manager] Analytics sending scheduled every ${ANALYTICS_SEND_INTERVAL_MS / 1000} seconds.`);
		sendingInterval = setInterval(() => this.sendMetrics(), ANALYTICS_SEND_INTERVAL_MS);

		// Send initial metrics shortly after startup (e.g., after 10 seconds)
		// This ensures some data gets sent even if the bot has short uptime.
		setTimeout(() => this.sendMetrics(), 10000);
	},

	/**
	 * Stops the periodic sending of analytics metrics.
	 */
	stopSending() {
		if (sendingInterval) {
			clearInterval(sendingInterval);
			sendingInterval = null;
			console.info('[Analytics Manager] Analytics sending stopped.');
		}
	},

	// TODO: Method to save current metrics to data/analytics.json (optional, for robustness)
	// This is a more advanced persistence layer, typically for ensuring no data loss on crash.
	// For now, we only save the config (installation_id, analytics_enabled).
	// Full persistence of metrics would require a separate mechanism if not sent frequently.
};

function hasMetrics(metricsToSend: AnalyticsMetrics): boolean {
	return Object.values(metricsToSend).some(val =>
		(typeof val === 'number' && val > 0) ||
		(val && typeof val === 'object' && Object.keys(val).length > 0 &&
			Object.values(val).some(nestedVal => typeof nestedVal === 'number' && nestedVal > 0)
		)
	);
}

// --- Graceful Shutdown for Final Metrics Sending ---
// This needs to be outside the analyticsManager object as it's a global process event.
process.on('beforeExit', async (code) => {
	// Only attempt to send if analytics are enabled and an installation ID exists
	if (analyticsManager.isEnabled() && analyticsManager.getInstallationId() && authToken) {
		console.info('[Analytics Manager] Attempting to send final analytics metrics before exit...');

		const finalMetrics = analyticsManager.getAndResetMetrics();

		if (finalMetrics && hasMetrics(finalMetrics)) {
			const endpoint = ANALYTICS_API_ENDPOINT;
			if (endpoint && localConfig.installation_id) {
				const finalPayload = {
					installation_id: localConfig.installation_id,
					recorded_at: new Date().toISOString(),
					app_version: getAppVersion(),
					node_version: process.version,
					os_platform: process.platform,
					is_running_with_pm2: isRunningWithPM2(),
					uptime_seconds_since_last_heartbeat: Math.floor((Date.now() - APP_START_TIME) / 1000),

					messages_analyzed_count: finalMetrics.messages_analyzed_count,
					messages_relevant_count: finalMetrics.messages_relevant_count,
					ai_provider_message_counts: finalMetrics.ai_provider_message_counts,
					ai_api_latency_ms: finalMetrics.ai_api_latency_ms,
					ai_api_success_counts: finalMetrics.ai_api_success_counts,
					ai_api_failure_counts: finalMetrics.ai_api_failure_counts,
				};

				try {
					await axios.post(endpoint, finalPayload, {
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${authToken}`,
						}
					});
					console.info('[Analytics Manager] Final analytics metrics sent successfully on exit.');
				} catch (error: any) {
					if (axios.isAxiosError(error) && error.response) {
						console.error(`[Analytics Manager] Error sending final analytics metrics on exit: ${error.response.status} ${error.response.statusText} - ${JSON.stringify(error.response.data)}`);
					} else {
						console.error(`[Analytics Manager] Network or generic error sending final analytics metrics on exit: ${error.message}`);
					}
				}
			} else {
				console.warn('[Analytics Manager] Cannot send final metrics: ANALYTICS_API_ENDPOINT, installation_id, or authToken not available.');
			}
		} else {
			console.info('[Analytics Manager] No final analytics metrics to send before exit.');
		}
	} else {
		console.info('[Analytics Manager] Final analytics send skipped: Analytics disabled, no installation ID, or no auth token.');
	}
	analyticsManager.stopSending(); // Always clear the interval on exit
});