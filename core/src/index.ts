// backend/src/index.ts
console.info('WhatsApp AI Filter backend is starting...');
import client from './whatsapp.js';
import { analyzeMessageWithLLM } from './llm/index.js';

client.on('message', async msg => {
	const senderContact = await msg.getContact();
	const senderName = msg.fromMe ? 'You' : senderContact.pushname || senderContact.name || 'Unknown Contact';

	const chat = await msg.getChat();
	const chatName = chat.name || msg.from; // Fallback to chat ID if name is not available

	const groupInfo = msg.from.endsWith('@g.us') ? ` in group "${chatName}"` : '';
	const chatUrl = `https://wa.me/${msg.from.replace('@c.us', '').replace('@g.us', '')}`;

	console.log('Received message:', {
		from: msg.from,
		sender: senderContact,
		group: groupInfo,
		body: msg.body,
		timestamp: msg.timestamp,
	});

	// Skip processing if the message is from an enterprise user or is a status update
	if (msg.from.endsWith('@broadcast') || senderContact.isEnterprise) {
		console.log('Skipping message from enterprise user or status update.');
		return;
	}
	const analysisResult = await analyzeMessageWithLLM(msg.body);
	console.debug('LLM Analysis Result:', analysisResult);

	if (analysisResult?.relevant) {
		const myContact = '917021803109@c.us';

		try {
			client.sendMessage(
				myContact,
				`[Relevant Message] From: ${senderName}${groupInfo}\nContent: ${msg.body}\n\nRelevance logic: ${analysisResult?.reasoning ?? "No reason provided"}\n\nChat Link: ${chatUrl}`
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