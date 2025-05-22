// backend/src/index.ts
console.info('WhatsApp AI Filter backend is starting...');
import client from './whatsapp.js';
import { analyzeMessageWithLLM } from './llm/index.js';
import { handleSelfChatCommand } from './commandHandler.js';
import { saveUserConfig, userConfig } from './dataStore.js';
import { Message, Contact, Chat } from 'whatsapp-web.js'; // Import Message, Contact, Chat for type hints

client.on('message_create', async (msg: Message) => {
	const senderContact: Contact = await msg.getContact();
	const chat: Chat = await msg.getChat();

	// Determine sender and chat names for logging and notifications
	const senderName = msg.fromMe ? 'You' : senderContact.pushname || senderContact.name || 'Unknown Contact';
	const chatName = chat.name || msg.from; // Fallback to chat ID if name is not available

	const groupInfo = msg.from.endsWith('@g.us') ? ` in group "${chatName}"` : '';
	const chatUrl = `https://wa.me/${msg.from.replace('@c.us', '').replace('@g.us', '')}`;

	console.log('Received message:', {
		from: msg.from,
		sender: senderContact,
		group: groupInfo,
		body: msg.body,
		hasMedia: msg.hasMedia,
		timestamp: msg.timestamp,
	});

	// --- Determine effective chat IDs ---
	const myClientId = client.info.wid._serialized; // Get the bot's own ID
	const commandChatId = userConfig['commandChatId'] || myClientId;
	const notificationChatId = userConfig['notificationChatId'] || myClientId;

	// --- Handle incoming messages ---
	if (msg.fromMe) {
		// This message was sent by the bot's own number.
		// It could be a command or a regular self-note.
		console.log(`[FROM ME] Message from self: ${msg.body}`);

		// --- Handle !set_command_chat and !set_notification_chat commands ---
		if (msg.body.trim() === '!set_command_chat') {
			userConfig['commandChatId'] = msg.from;
			saveUserConfig();
			await msg.reply(`This chat "${chatName}" has been set as the dedicated bot command channel!`);
			console.log(`Bot command chat set to: ${msg.from}`);
			return;
		} else if (msg.body.trim() === '!set_notification_chat') {
			userConfig['notificationChatId'] = msg.from;
			saveUserConfig();
			await msg.reply(`This chat "${chatName}" has been set as the dedicated bot notification channel!`);
			console.log(`Bot notification chat set to: ${msg.from}`);
			return;
		}

		// Handle commands sent by the user to themselves
		if (msg.body.startsWith('!') && msg.from === commandChatId) {
			console.log(`[COMMAND] Processing self-sent command in dedicated chat (${commandChatId}): "${msg.body}"`);
			await handleSelfChatCommand(msg);
		} else if (msg.from !== commandChatId) {
			// If it's a self-sent message but NOT in the designated command chat, ignore it
			console.log(`[INFO] Ignoring self-sent message not in command chat (${commandChatId}): "${msg.body}"`);
		} else {
			// If it's a self-sent message in the command chat, but not a command
			console.log(`[INFO] Ignoring non-command self-sent message in command chat (${commandChatId}): "${msg.body}"`);
		}
		return; // Always return after processing a message from self
	}

	// Skip processing if the message is from an enterprise user or is a status update
	if (msg.isStatus || senderContact.isEnterprise || msg.from === commandChatId || msg.from === notificationChatId) {
		console.log('Skipping message from enterprise user, self-chat or status update.');
		return;
	}
	const analysisResult = await analyzeMessageWithLLM(msg.body);
	console.debug('LLM Analysis Result:', analysisResult);

	if (analysisResult?.relevant) {
		try {
			// Send relevant message to the configured notification chat
			await client.sendMessage(
				notificationChatId, // Use the dynamically determined notification chat
				`[Relevant Message] From: ${senderName}${groupInfo}\nContent: ${msg.body}\n\nRelevance logic: ${analysisResult?.reasoning ?? "No reason provided"}\n\nChat Link: ${chatUrl}`
			);
			console.log(`Notification sent to ${notificationChatId}`);
		} catch (error: any) {
			console.error(`Error sending notification to ${notificationChatId}:`, error);
			// Fallback: send to self-chat if notification chat fails
			await client.sendMessage(
				myClientId,
				`[Relevant Message - Error sending to configured chat] From: ${senderName}${groupInfo}\nContent: ${msg.body}\nChat Link: ${chatUrl}\n\nError: ${error.message}`
			);
		}
	}
});