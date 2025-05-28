const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

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
