// backend/src/dataSync.ts
import { Client, Message, Chat } from 'whatsapp-web.js';
import { userConfig, saveUserConfig } from './dataStore.js';
import { handleSelfChatCommand } from './commandHandler.js';

export async function syncDataFromSelfChatHistory(client: Client, options?: { force?: boolean, chatId?: string }) {
	console.log('Starting data sync...');
	try {
		// If user_config already exists and not forced, do nothing
		if (!options?.force) {
			if (userConfig && Object.keys(userConfig).length > 0 && userConfig.interests) {
				console.log('User config already exists. Skipping data sync.');
				return;
			}
		}

		const chats = await client.getChats();
		// Use the dedicated command chat if provided, else fallback to self-chat
		let targetChatId = options?.chatId || userConfig.commandChatId;
		if (!targetChatId) {
			targetChatId = client.info.wid._serialized;
		}
		const targetChat = chats.find((chat: Chat) => chat.id._serialized === targetChatId);
		if (!targetChat) {
			console.warn('Target command chat not found. Cannot sync history.');
			return;
		}

		// Fetch a reasonable number of messages. Adjust 'limit' as needed.
		// Be mindful of WhatsApp's rate limits if fetching too many.
		const messages = await targetChat.fetchMessages({ limit: 200 });
		Object.keys(userConfig).forEach(key => delete userConfig[key]);
		for (const msg of messages.reverse()) {
			if (msg.fromMe && msg.body.startsWith('!')) {
				console.log(`Replaying history command: ${msg.body}`);
				await handleSelfChatCommand(msg);
			}
		}
		saveUserConfig();
		console.log('Data sync from command chat history complete.');
	} catch (error) {
		console.error('Error during command chat history sync:', error);
	}
}