// backend/src/whatsapp.ts
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import { loadUserConfig, saveUserConfig, userConfig } from './dataStore.js';
import { syncDataFromSelfChatHistory } from './dataSync.js';

const client = new Client({
	authStrategy: new LocalAuth(),
	puppeteer: {
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage', // Recommended for Alpine/Docker to prevent memory issues
			'--disable-accelerated-2d-canvas', // Recommended for headless
			'--no-first-run',
			'--no-zygote',
			'--single-process', // Often helps in Docker environments
			'--disable-gpu' // Often helps in Docker environments
		]
	}
});

client.on('qr', qr => {
	console.info('Scan this QR code to log in:');
	qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
		if (err) {
			console.error('Error generating QR code:', err);
			return;
		}
		console.log(url);
	});
});

client.on('ready', async () => {
	console.info('WhatsApp Web client is ready!');
	loadUserConfig();
	const myClientId = client.info.wid._serialized;

	// Set defaults if not already set by user
	if (!userConfig['commandChatId']) {
		userConfig['commandChatId'] = myClientId;
		saveUserConfig(); // Save immediately so default is persisted
	}
	if (!userConfig['notificationChatId']) {
		userConfig['notificationChatId'] = myClientId;
		saveUserConfig(); // Save immediately so default is persisted
	}

	// This is a good place to send the greeting message
	const greetingMessage = `
Hello! I'm your WhatsApp AI Filter bot.

**Default Behavior:**
* You can send **commands** to me in this chat (your self-chat) starting with an exclamation mark, e.g., \`!list\` or \`!set my_key=my_value\`.
* I will send **relevant message notifications** back to this chat as well.

**To customize where commands and notifications go:**
* Send \`!set_command_chat\` in the chat you want to use for commands.
* Send \`!set_notification_chat\` in the chat you want to use for notifications.

You can set these to the same chat (e.g., a dedicated group) or different ones. We recommend creating dedicated groups for each, which will just have you in them.

Type \`!list\` to see your current settings.
	`;

	// Send the greeting message to the user's self-chat
	try {
		await client.sendMessage(myClientId, greetingMessage.trim());
		console.log('Initial greeting message sent to self-chat.');
	} catch (error) {
		console.error('Error sending initial greeting message:', error);
	}

	// Now proceed with data sync (this should happen after config is loaded/defaulted)
	await syncDataFromSelfChatHistory(client);

	const getStartedMessage = `
**Getting Started:**
Let's get you set up! Starting by setting up your interests. You can do this by sending me a message in this chat with the format \`!set interests=your_interests_here\`.
You can set multiple interests by separating them with commas, e.g., \`!set interests=AI, WhatsApp\`.

Copy the below and paste it into this chat to get started:
\`!set interests=AI, WhatsApp automation\`
	`;
	try {
		await client.sendMessage(myClientId, getStartedMessage.trim());
		console.log('Get started message sent to self-chat.');
	} catch (error) {
		console.error('Error sending get started message:', error);
	}

	console.log('Current user config after sync and defaults:', userConfig);
});

client.initialize()
	.then(() => {
		console.info('WhatsApp Web client initialized successfully.');
	})
	.catch(err => {
		console.error('Error initializing WhatsApp Web client:', err);
	});

// The 'message' event will be handled in index.ts
export default client;