// backend/src/index.ts
console.log('WhatsApp AI Filter backend is starting...');
import client from './whatsapp.js';
import { analyzeMessageWithLLM } from './llm/index.js';

client.on('message', async msg => {
	console.log('Received message:', msg.body, 'from:', msg.from);

	// Example of how you might use the LLM
	const analysisResult = await analyzeMessageWithLLM(msg.body);
	console.log('LLM Analysis Result:', analysisResult);

	// Add your logic here to decide if you need to interact with the message
	if (analysisResult?.relevant) {
		// Example: Send a message to yourself
		const myContact = '917021803109@c.us'; // Replace with your actual contact ID
		client.sendMessage(myContact, `[Relevant Message in ${msg.from}] ${msg.body}`);
	}
});