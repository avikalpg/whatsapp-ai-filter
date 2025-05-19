// backend/src/whatsapp.ts
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';

const client = new Client({
	authStrategy: new LocalAuth()
});

client.on('qr', qr => {
	console.log('Scan this QR code to log in:');
	qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
		if (err) {
			console.error('Error generating QR code:', err);
			return;
		}
		console.log(url);
	});
});

client.on('ready', () => {
	console.log('WhatsApp Web client is ready!');
});

client.initialize()
	.then(() => {
		console.log('WhatsApp Web client initialized successfully.');
	})
	.catch(err => {
		console.error('Error initializing WhatsApp Web client:', err);
	});

// The 'message' event will be handled in index.ts
export default client;