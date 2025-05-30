import 'dotenv/config';
console.info('WhatsApp AI Filter backend is starting...');
import client from './whatsapp.js';
import { analyzeMessageWithLLM } from './llm/index.js';
import { handleSelfChatCommand } from './commandHandler.js';
import { saveUserConfig, userConfig } from './dataStore.js';
import { Message, Contact, Chat } from 'whatsapp-web.js'; // Import Message, Contact, Chat for type hints
import { analyticsManager } from './analyticsManager.js';

async function main() {
	// 1. Initialize analytics manager FIRST.
	// This ensures installation_id is ready before any potential data collection.
	await analyticsManager.init();
	console.log('Analytics Manager Initialized.');

	if (analyticsManager.isEnabled()) {
		console.log(`Analytics enabled. Installation ID: ${analyticsManager.getInstallationId()}`);
	} else {
		console.log('Analytics disabled by user preference.');
	}

	// 2. Initialize the WhatsApp client.
	// This will trigger the 'qr' and 'ready' events defined in whatsapp.ts.
	console.log('Initializing WhatsApp Web client...');
	try {
		await client.initialize();
		console.info('WhatsApp Web client initialized successfully.');
	} catch (err) {
		console.error('Error initializing WhatsApp Web client:', err);
		// It's critical if the client doesn't initialize, so we might want to exit.
		process.exit(1);
	}

	// 3. Set up your message_create event listener.
	// This ensures the client is ready and analytics manager is initialized before messages are processed.
	client.on('message_create', async (msg: Message) => {
		const senderContact: Contact = await msg.getContact();
		const chat: Chat = await msg.getChat();

		// Determine sender and chat names for logging and notifications
		const senderName = msg.fromMe ? 'You' : senderContact.pushname || senderContact.name || 'Unknown Contact';
		const chatName = chat.name || msg.from; // Fallback to chat ID if name is not available

		// IMPORTANT: Get the actual originating chat ID
		// If msg.fromMe, msg.id.remote is the actual chat where it was sent (self-chat or group)
		// If not msg.fromMe, msg.from is already the correct chat ID.
		const actualChatId = msg.fromMe ? msg.id.remote : msg.from;

		const isActuallyGroup = actualChatId.endsWith('@g.us');
		const groupInfo = isActuallyGroup ? ` in group "${chatName}"` : '';

		console.log('Received message:', {
			from: msg.from,
			actualChatId: actualChatId,
			sender: senderContact,
			isFromMe: msg.fromMe,
			group: groupInfo,
			body: msg.body,
			hasMedia: msg.hasMedia,
			timestamp: msg.timestamp,
		});

		// --- Determine effective chat IDs ---
		const myClientId = client.info.wid._serialized;
		const commandChatId = userConfig['commandChatId'] || myClientId;
		const notificationChatId = userConfig['notificationChatId'] || myClientId;

		// --- Handle incoming messages ---
		if (msg.fromMe) {
			// This message was sent by the bot's own number.
			console.log(`[FROM ME] Message from self. Actual Chat ID: "${actualChatId}". Message: "${msg.body}"`);

			// --- Handle !set_command_chat and !set_notification_chat commands ---
			if (msg.body.trim() === '!set_command_chat') {
				userConfig['commandChatId'] = actualChatId; // Store the actual originating chat ID
				saveUserConfig();
				await msg.reply(`This chat "${chatName}" has been set as the dedicated bot command channel!`);
				console.log(`Bot command chat set to: ${actualChatId}`);
				return;
			} else if (msg.body.trim() === '!set_notification_chat') {
				userConfig['notificationChatId'] = actualChatId; // Store the actual originating chat ID
				saveUserConfig();
				await msg.reply(`This chat "${chatName}" has been set as the dedicated bot notification channel!`);
				console.log(`Bot notification chat set to: ${actualChatId}`);
				return;
			}

			// --- Handle other commands sent by the user to themselves ---
			if (msg.body.startsWith('!') && actualChatId === commandChatId) {
				console.log(`[COMMAND] Processing self-sent command in designated chat (${commandChatId}). Message: "${msg.body}"`);
				await handleSelfChatCommand(msg);
			} else if (actualChatId !== commandChatId && msg.body.startsWith('!')) {
				// If it's a self-sent command, but NOT in the designated command chat
				console.log(`[INFO] Ignoring self-sent command not in designated command chat (${commandChatId}). Message: "${msg.body}"`);
			} else {
				// If it's a self-sent message in the command chat, but not a command
				console.log(`[INFO] Ignoring non-command self-sent message in designated command chat (${commandChatId}). Message: "${msg.body}"`);
			}
			return; // Always return after processing a message from self
		}

		// Skip processing if the message is from an enterprise user or is a status update
		if (msg.isStatus || senderContact.isEnterprise || msg.from === commandChatId || msg.from === notificationChatId) {
			console.log('Skipping message from enterprise user, self-chat or status update.');
			return;
		}

		// --- NEW: Filtering logic for direct/group messages ---
		const processDirectMessages = userConfig.processDirectMessages !== false; // default true
		const groupInclusionList = userConfig.groupInclusionList || [];
		const groupExclusionList = userConfig.groupExclusionList || [];

		if (isActuallyGroup) {
			// Group message
			if (groupInclusionList.length > 0) {
				if (!groupInclusionList.includes(actualChatId)) {
					console.log(`Group ${actualChatId} not in inclusion list, skipping.`);
					return;
				}
			} else if (groupExclusionList.length > 0) {
				if (groupExclusionList.includes(actualChatId)) {
					console.log(`Group ${actualChatId} is in exclusion list, skipping.`);
					return;
				}
			}
		} else {
			// Direct message
			if (!processDirectMessages) {
				console.log('Direct message processing is disabled, skipping.');
				return;
			}
		}

		const analysisResult = await analyzeMessageWithLLM(msg.body)
			.then((result) => {
				analyticsManager.incrementMessagesAnalyzed();
				return result;
			})
			.catch(async (error) => {
				console.error('Error analyzing message with LLM:', error);
				// AI API failure metrics are handled within llm/index.ts's orchestrator
				await client.sendMessage(
					notificationChatId,
					`[Error] From: ${senderName}${groupInfo}\nContent: ${msg.body}\n\nError: ${error.message}`,
					{ quotedMessageId: msg.id._serialized }
				);
				return null;
			});
		console.debug('LLM Analysis Result:', analysisResult);

		if (analysisResult?.relevant) {
			analyticsManager.incrementMessagesRelevant();
			try {
				await client.sendMessage(
					notificationChatId,
					`[Relevant Message] From: ${senderName}${groupInfo}\nContent: ${msg.body}\n\nRelevance logic: ${analysisResult?.reasoning ?? "No reason provided"}`,
					{ quotedMessageId: msg.id._serialized }
				);
				console.log(`Notification sent to ${notificationChatId} quoting message ID: ${msg.id._serialized}`);
			} catch (error: any) {
				console.error(`Error sending notification to ${notificationChatId} with quote:`, error);
				// Fallback to sending without quote if quoting failed (e.g., message not found, though rare here)
				await client.sendMessage(
					myClientId,
					`[Relevant Message - Error sending to configured chat with quote] From: ${senderName}${groupInfo}\nContent: ${msg.body}\n\nError: ${error.message}`
				);
			}
		}
	});

	console.log('Bot application fully started and ready to process messages.');
}

main().catch(error => {
	console.error('FATAL ERROR: Bot application failed to start:', error);
	process.exit(1);
});