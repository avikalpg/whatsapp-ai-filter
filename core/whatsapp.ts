// backend/src/whatsapp.ts
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import readline from 'readline';

const client = new Client({
	authStrategy: new LocalAuth()
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

	try {
		const chats = await client.getChats();
		const groupChats = chats.filter(chat => chat.isGroup);

		console.info('Available group chats:');
		groupChats.forEach((group, index) => {
			console.info(`${index + 1}: ${group.name}`);
		});

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		rl.question('Enter the numbers of the group chats to select (comma-separated): ', (answer) => {
			const selectedIndexes = answer.split(',').map(num => parseInt(num.trim(), 10) - 1);
			const selectedGroups = selectedIndexes.map(index => groupChats[index]).filter(Boolean);

			console.info('Selected group chats:');
			selectedGroups.forEach(group => console.info(group.name));

			// Perform actions on the selected group chats
			selectedGroups.forEach(group => {
				console.info(`Performing actions on group: ${group.name}`);
				// Add your group-specific logic here
			});

			rl.close();
		});
	} catch (err) {
		console.error('Error fetching group chats:', err);
	}
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