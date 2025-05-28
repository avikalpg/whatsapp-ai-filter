// src/config/env.ts

/**
 * Hardcoded base URLs for different environments.
 * These URLs are part of the committed codebase and are NOT configurable by the end-user.
 */
const ANALYTICS_DEV_BASE_URL = 'http://localhost:3000';
const ANALYTICS_PROD_BASE_URL = 'https://whatsapp-ai-filter.vercel.app';

/**
 * Determines the active analytics base URL based on the NODE_ENV environment variable.
 * - If NODE_ENV is 'dev', the development URL is used.
 * - Otherwise (e.g., 'prod', 'production', undefined), the production URL is used.
 */
export const ANALYTICS_BASE_URL = process.env.NODE_ENV === 'dev'
	? ANALYTICS_DEV_BASE_URL
	: ANALYTICS_PROD_BASE_URL;

// You can add other environment-specific constants here if your application grows
// export const ANOTHER_SERVICE_BASE_URL = process.env.NODE_ENV === 'prod' ? 'https://prod.service.com' : 'http://dev.service.com';
// export const DEBUG_MODE_ENABLED = process.env.NODE_ENV === 'dev';