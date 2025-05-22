// backend/src/dataSync.ts
import { Client, Message } from 'whatsapp-web.js';
import { userConfig, saveUserConfig } from './dataStore.js';
import { handleSelfChatCommand } from './commandHandler.js';

export async function syncDataFromSelfChatHistory(client: Client) {
	console.log('Starting data sync from self-chat history...');
	try {
		const chats = await client.getChats();
		const selfChat = chats.find(chat => chat.id.user === client.info.wid.user && !chat.isGroup); // Find your own chat
		// In multi-device, your own chat is usually the one where from === to for messages.
		// Or you can get your own ID using client.info.wid and find messages where msg.from === client.info.wid.user.

		if (!selfChat) {
			console.warn('Self-chat not found. Cannot sync history.');
			return;
		}

		// Fetch a reasonable number of messages. Adjust 'limit' as needed.
		// Be mindful of WhatsApp's rate limits if fetching too many.
		const messages = await selfChat.fetchMessages({ limit: 200 }); // Fetch last 200 messages

		// Clear current in-memory state before rebuilding
		// For now, let's just re-initialize userConfig.
		// In a real scenario, you'd manage your data structures more carefully.
		Object.keys(userConfig).forEach(key => delete userConfig[key]);

		// Process messages in reverse order (oldest first) to apply commands sequentially
		for (const msg of messages.reverse()) {
			if (msg.fromMe && msg.to === msg.from && msg.body.startsWith('!')) {
				// This is a self-chat command/data entry
				console.log(`Replaying history command: ${msg.body}`);
				// This is where you'd parse and apply the command/data
				// Similar to handleSelfChatCommand, but optimized for replay
				await handleSelfChatCommand(msg) // A dedicated function for history replay
			}
		}
		saveUserConfig(); // Save the rebuilt state after sync
		console.log('Data sync from self-chat history complete.');

	} catch (error) {
		console.error('Error during self-chat history sync:', error);
	}
}