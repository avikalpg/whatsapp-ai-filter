// backend/src/index.ts
console.info('WhatsApp AI Filter backend is starting...');
import client from './whatsapp.js';
import { analyzeMessageWithLLM } from './llm/index.js';

client.on('message', async msg => {
	console.log('Received message:', {
		from: msg.from,
		sender: await msg.getContact(),
		group: msg.from.endsWith('@g.us') ? ` in group "${(await msg.getChat()).name}"` : '',
		body: msg.body,
		timestamp: msg.timestamp,
	});

	const analysisResult = await analyzeMessageWithLLM(msg.body);
	console.debug('LLM Analysis Result:', analysisResult);

	if (analysisResult?.relevant) {
		const myContact = '917021803109@c.us';

		try {
			const senderContact = await msg.getContact();
			const senderName = msg.fromMe ? 'You' : senderContact.pushname || senderContact.name || 'Unknown Contact';

			const chat = await msg.getChat();
			const chatName = chat.name || msg.from; // Fallback to chat ID if name is not available

			const groupInfo = msg.from.endsWith('@g.us') ? ` in group "${chatName}"` : '';
			const chatUrl = `https://web.whatsapp.com/send?chat=${msg.from}`;

			client.sendMessage(
				myContact,
				`[Relevant Message] From: ${senderName}${groupInfo}\nContent: ${msg.body}\nChat Link: ${chatUrl}`
			);
		} catch (error) {
			console.error('Error fetching contact or chat information:', error);
			client.sendMessage(
				myContact,
				`[Relevant Message - Error getting sender/chat info]\nContent: ${msg.body}\nChat ID: ${msg.from}`
			);
		}
	}
});