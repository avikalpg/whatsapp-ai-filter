// backend/src/index.ts
console.log('WhatsApp AI Filter backend is starting...');
import client from './whatsapp.js';

client.on('message', async msg => {
	console.log('Received message:', msg.body, 'from:', msg.from);

});