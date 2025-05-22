// backend/src/commandHandler.ts
import { Message } from 'whatsapp-web.js';
import { userConfig, saveUserConfig } from './dataStore.js';

export async function handleSelfChatCommand(msg: Message) {
	const commandText = msg.body.trim();
	const parts = commandText.split(' ');
	const mainCommand = parts[0].toLowerCase();

	switch (mainCommand) {
		case '!set':
			// Expecting format: !set key=value
			const setValuePart = commandText.substring(mainCommand.length).trim();
			const equalsIndex = setValuePart.indexOf('=');

			if (equalsIndex > 0) {
				const key = setValuePart.substring(0, equalsIndex).trim();
				const value = setValuePart.substring(equalsIndex + 2).trim();

				if (key) {
					if (key.toLowerCase() === "interests") {
						// This is a special case where we expect a comma-separated list
						const interestsArray = value.split(',').map(interest => interest.trim());
						userConfig[key] = interestsArray;
						saveUserConfig();
						await msg.reply(`Set "${key}" to: "${interestsArray.join(', ')}"`);
					} else {
						userConfig[key] = value;
						saveUserConfig();
						await msg.reply(`Set "${key}" to: "${value}"`);
					}
				} else {
					await msg.reply('Usage: !set <key>=<value>');
				}
			} else {
				await msg.reply('Usage: !set <key>=<value>');
			}
			break;

		case '!get':
			// Expecting format: !get <key>
			const getKey = parts[1]?.toLowerCase();

			if (getKey) {
				if (getKey === 'interests') {
					const interests = userConfig[getKey];
					if (interests) {
						await msg.reply(`Interests: "${interests.join(', ')}"`);
					} else {
						await msg.reply(`Key "${getKey}" not found.`);
					}
				}
				// For other keys, just get the value
				const value = userConfig[getKey];
				if (value !== undefined) {
					await msg.reply(`Value for "${getKey}": "${value}"`);
				} else {
					await msg.reply(`Key "${getKey}" not found.`);
				}
			} else {
				await msg.reply('Usage: !get <key>');
			}
			break;

		case '!list':
			// List all keys and values
			const configKeys = Object.keys(userConfig);
			if (configKeys.length > 0) {
				let response = 'Your current configurations:\n';
				for (const key of configKeys) {
					response += `- ${key}: ${userConfig[key].toString()}\n`;
				}
				await msg.reply(response.trim());
			} else {
				await msg.reply('No configurations set yet.');
			}
			break;

		// !set_command_chat and !set_notification_chat commands are now handled directly in index.ts
		// This 'default' will catch any other commands that aren't defined here.
		default:
			await msg.reply(`Unknown command: ${mainCommand}. Available commands: !set, !get, !list.
            To set command/notification chats, use '!set_command_chat' or '!set_notification_chat' in the desired chat.`);
	}
}