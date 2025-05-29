const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

function createWindow() {
	const win = new BrowserWindow({
		width: 900,
		height: 700,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});
	win.loadFile('index.html');
}

// Path to the built core bot (ensure core is built before running Electron)
const coreBotPath = path.join(__dirname, '../core/dist/index.js');

// Start the core bot as a child process
let coreBotProcess = null;
function startCoreBot() {
	if (coreBotProcess) return;
	coreBotProcess = fork(coreBotPath, [], {
		cwd: path.join(__dirname, '../core'),
		stdio: 'inherit',
	});
	coreBotProcess.on('exit', (code) => {
		console.log(`Core bot process exited with code ${code}`);
		coreBotProcess = null;
	});
}

const dotenvPath = path.join(__dirname, '../core/.env');
const userConfigPath = path.join(__dirname, '../data/user_config.json');

function readConfig() {
	if (!fs.existsSync(dotenvPath)) return {};
	const lines = fs.readFileSync(dotenvPath, 'utf-8').split('\n');
	const config = {};
	for (const line of lines) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (m) config[m[1]] = m[2];
	}
	return config;
}

function saveConfig(config) {
	const content = [
		`OPENAI_API_KEY=${config.OPENAI_API_KEY || ''}`,
		`PERPLEXITY_API_KEY=${config.PERPLEXITY_API_KEY || ''}`,
		`INTERESTS=${config.INTERESTS || ''}`,
		`ANALYTICS_ENABLED=true`,
	].join('\n');
	fs.writeFileSync(dotenvPath, content);
	return true;
}

function readUserConfig() {
	if (!fs.existsSync(userConfigPath)) return {};
	try {
		return JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
	} catch (e) {
		return {};
	}
}

function saveUserConfig(config) {
	fs.writeFileSync(userConfigPath, JSON.stringify(config, null, 2));
	return true;
}

ipcMain.handle('get-config', () => readConfig());
ipcMain.handle('save-config', (event, config) => saveConfig(config));
ipcMain.handle('get-user-config', () => readUserConfig());
ipcMain.handle('save-user-config', (event, config) => saveUserConfig(config));

// To send notifications from the core bot, you would need to set up IPC or use stdout parsing.
// For now, this is a placeholder for future integration.

app.whenReady().then(() => {
	createWindow();
	startCoreBot();

	app.on('activate', function () {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') app.quit();
});
