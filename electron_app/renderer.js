const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
	const form = document.getElementById('config-form');
	const perplexityInput = document.getElementById('perplexity-key');
	const openaiInput = document.getElementById('openai-key');
	const interestsInput = document.getElementById('interests');
	const saveStatus = document.getElementById('save-status');
	const notificationsDiv = document.getElementById('notifications');

	// Load existing config (if any)
	ipcRenderer.invoke('get-config').then((config) => {
		if (config) {
			perplexityInput.value = config.PERPLEXITY_API_KEY || '';
			openaiInput.value = config.OPENAI_API_KEY || '';
		}
	});
	ipcRenderer.invoke('get-user-config').then((userConfig) => {
		if (userConfig) {
			interestsInput.value = Array.isArray(userConfig.interests) ? userConfig.interests.join(', ') : (userConfig.interests || '');
		}
	});

	form.addEventListener('submit', (e) => {
		e.preventDefault();
		// Save .env settings
		const config = {
			PERPLEXITY_API_KEY: perplexityInput.value,
			OPENAI_API_KEY: openaiInput.value,
		};
		// Save both config and user config, then update status based on both
		Promise.all([
			ipcRenderer.invoke('save-config', config),
			ipcRenderer.invoke('save-user-config', {
				interests: interestsInput.value.split(',').map(s => s.trim()).filter(Boolean),
			}),
		]).then(([configOk, userConfigOk]) => {
			const ok = configOk && userConfigOk;
			saveStatus.textContent = ok ? 'Saved!' : 'Failed to save';
			setTimeout(() => (saveStatus.textContent = ''), 2000);
		});
	});

	// Listen for relevant message notifications
	ipcRenderer.on('relevant-message', (event, message) => {
		// Show desktop notification
		new Notification('Relevant WhatsApp Message', { body: message });
		// Also append to notifications area
		const div = document.createElement('div');
		div.textContent = message;
		notificationsDiv.prepend(div);
	});
});

// This file can be used to communicate with the main process or display status/logs
// For now, it just shows a static message.
console.log('Renderer loaded.');
