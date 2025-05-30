// backend/src/dataStore.ts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's path in ESM
const __filename = fileURLToPath(import.meta.url);
// Get the current directory's path in ESM
const __dirname = path.dirname(__filename);

// Correct path resolution:
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export let userConfig: {
	interests?: string[];
	commandChatId?: string;     // New config key for command chat ID
	notificationChatId?: string; // New config key for notification chat ID
	processDirectMessages?: boolean; // Whether to process direct messages
	groupInclusionList?: string[];   // List of group IDs to include
	groupExclusionList?: string[];   // List of group IDs to exclude
	[key: string]: any; // Allow other dynamic keys
} = {};

function ensureDataDir() {
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
	}
}

export function loadUserConfig() {
	ensureDataDir();
	if (fs.existsSync(USER_CONFIG_FILE)) {
		try {
			const data = fs.readFileSync(USER_CONFIG_FILE, 'utf8');
			userConfig = JSON.parse(data);
			console.log('User configuration loaded from file.');
		} catch (error) {
			console.error('Error loading user configuration from file:', error);
			userConfig = {}; // Reset if corrupted
		}
	} else {
		console.log('User configuration file not found, starting with empty config.');
		userConfig = {};
	}
}

export function saveUserConfig() {
	ensureDataDir();
	try {
		fs.writeFileSync(USER_CONFIG_FILE, JSON.stringify(userConfig, null, 2), 'utf8');
		console.log('User configuration saved to file.', userConfig, JSON.stringify(userConfig, null, 2), JSON.stringify(userConfig));
	} catch (error) {
		console.error('Error saving user configuration to file:', error);
	}
}

// Define USER_CONFIG_FILE here, after __dirname is defined
const USER_CONFIG_FILE = path.join(DATA_DIR, 'user_config.json');

// Initial load when the module is imported
loadUserConfig();