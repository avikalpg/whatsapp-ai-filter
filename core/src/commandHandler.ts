// backend/src/commandHandler.ts
import { Message, MessageSendOptions } from 'whatsapp-web.js';
import { userConfig, saveUserConfig } from './dataStore.js';
import client from './whatsapp.js';
import { setWizardState, getWizardState, clearWizardState, WizardState } from './wizardState.js';

export async function handleSelfChatCommand(msg: Message) {
	const commandText = msg.body.trim();
	const parts = commandText.split(' ');
	const mainCommand = parts[0].toLowerCase();

	async function getConfigValue(key: string): Promise<string | { id: string, subject: string }[] | null> {
		const getKey = key.toLowerCase();

		if (getKey) {
			if (getKey === 'interests') {
				const interests = userConfig[getKey];
				if (interests) {
					return interests.map(interest => `\n\t- ${interest}`).join(',');
				} else {
					return null;
				}
			} else if (getKey === 'groupinclusionlist' || getKey === 'groupexclusionlist') {
				const actualKey = Object.keys(userConfig).find(k => k.toLowerCase() === getKey);
				const list: string[] = actualKey ? userConfig[actualKey] : [];
				if (list && list.length > 0) {
					const groupNames = []
					for (let groupInList of list) {
						const chat = await client.getChatById(groupInList);
						groupNames.push({
							subject: chat ? chat.name : groupInList, // Fallback to ID if chat not found
							id: groupInList
						});
					};
					return groupNames;
				} else {
					return null;
				}
			} else if (getKey === 'commandchatid' || getKey === 'notificationchatid') {
				const actualKey = Object.keys(userConfig).find(k => k.toLowerCase() === getKey);
				const id = actualKey ? userConfig[actualKey] : undefined;
				if (!id) return null;
				const chat = await client.getChatById(id).catch(() => null);
				if (!chat) return null;
				if (chat.isGroup) {
					return [{ id: chat.id._serialized, subject: chat.name }];
				}
				const contact = await client.getContactById(id).catch(() => null);
				if (contact) {
					return `@${contact.id.user}`;
				}
				throw new Error(`Chat with ID ${id} not found`);
			}
			// For other keys, just get the value
			const actualKey = Object.keys(userConfig).find(k => k.toLowerCase() === getKey);
			return actualKey ? JSON.stringify(userConfig[actualKey]) : null;
		} else {
			throw new Error('Usage: `!get <key>`');
		}
	}

	switch (mainCommand) {
		case '!set': {
			const setValuePart = commandText.substring(mainCommand.length).trim();
			const equalsIndex = setValuePart.indexOf('=');

			// --- Unified group filter flow ---
			if (setValuePart === 'groups' || setValuePart.startsWith('groups ')) {
				const userId = msg.from;
				// Use Partial<WizardState> for type safety
				const wizard: Partial<WizardState> = getWizardState(userId) || {};

				// Step 1: User sends '!set groups'
				if (setValuePart === 'groups') {
					await msg.reply(
						'Select group filter type:\n1. Inclusion List (only these groups will be processed)\n2. Exclusion List (all except these groups will be processed)\n\nReply with `!set groups 1` for Inclusion or `!set groups 2` for Exclusion.'
					);
					setWizardState(userId, { step: 'awaiting-type' });
					return;
				}

				// Step 2: User sends '!set groups 1' or '!set groups 2'
				if (wizard.step === 'awaiting-type') {
					const typeVal = setValuePart.replace('groups', '').trim();
					if (typeVal === '1' || typeVal.toLowerCase() === 'inclusion') {
						wizard.mode = 'inclusion';
					} else if (typeVal === '2' || typeVal.toLowerCase() === 'exclusion') {
						wizard.mode = 'exclusion';
					} else {
						await msg.reply('Invalid reply. Reply with `!set groups 1` for Inclusion or `!set groups 2` for Exclusion.');
						return;
					}
					wizard.step = 'awaiting-selection';
					setWizardState(userId, wizard);

					// Fetch groups and show numbered list
					const chats = await client.getChats();
					const groups = chats.filter((c: any) => c.isGroup);
					if (!groups.length) {
						await msg.reply('You are not a member of any groups.');
						clearWizardState(userId);
						return;
					}
					wizard.groups = groups.map((g: any) => ({ id: g.id._serialized, name: g.name }));
					setWizardState(userId, wizard);
					let listMsg = 'Reply with the numbers of the groups you want to add, separated by commas.\n';
					listMsg += 'Example: `!set groups 1,3,5`\n';
					groups.forEach((g: any, i: number) => {
						listMsg += `${i + 1}. ${g.name} (${g.id._serialized})\n`;
					});
					await msg.reply(listMsg.trim());
					return;
				}

				// Step 3: User sends '!set groups 1,3,5'
				if (wizard.step === 'awaiting-selection') {
					const numsStr = setValuePart.replace('groups', '').trim();
					const nums = numsStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
					const groupObjs = wizard.groups || [];
					const selected = nums.map(n => groupObjs[n - 1]).filter(Boolean);
					if (!selected.length) {
						await msg.reply('No valid group numbers provided. Please try again with `!set groups 1,2,...`');
						return;
					}
					if (wizard.mode === 'inclusion') {
						userConfig.groupInclusionList = selected.map(g => g.id);
						userConfig.groupExclusionList = [];
						await msg.reply(`Inclusion list set to: ${selected.map(g => g.name).join(', ')}`);
					} else {
						userConfig.groupExclusionList = selected.map(g => g.id);
						userConfig.groupInclusionList = [];
						await msg.reply(`Exclusion list set to: ${selected.map(g => g.name).join(', ')}`);
					}
					clearWizardState(userId);
					saveUserConfig();
					return;
				}
			}

			// --- Normal !set key=value logic ---
			if (equalsIndex > 0) {
				const key = setValuePart.substring(0, equalsIndex).trim();
				const value = setValuePart.substring(equalsIndex + 1).trim();

				if (key) {
					if (key.toLowerCase() === 'interests') {
						const interestsArray = value.split(',').map(interest => interest.trim());
						userConfig.interests = interestsArray;
						saveUserConfig();
						await msg.reply(`Set "${key}" to: "${interestsArray.join(', ')}"`);
					} else if (key.toLowerCase() === 'processdirectmessages') {
						const boolVal = value.toLowerCase() === 'on' || value === 'true';
						userConfig.processDirectMessages = boolVal;
						saveUserConfig();
						await msg.reply(`Set processDirectMessages to: ${boolVal ? 'ENABLED' : 'DISABLED'}`);
					} else if (key.toLowerCase() in ['groupinclusionlist', 'groupexclusionlist']) {
						await msg.reply('Use `!set groups` to configure group inclusion/exclusion lists interactively.');
					} else if (key.toLowerCase() in ['commandChatId', 'notificationChatId']) {
						await msg.reply(`To set ${key}, use the command in the desired chat: \`!set_command_chat\` or \`!set_notification_chat\`.`);
					} else {
						userConfig[key] = value;
						saveUserConfig();
						await msg.reply(`Set "${key}" to: "${value}"`);
					}
				} else {
					await msg.reply('Usage: `!set <key>=<value>`');
				}
			} else {
				await msg.reply('Usage: `!set <key>=<value>`');
			}
			break;
		}
		case '!get': {
			// Expecting format: !get <key>
			if (parts.length < 2) {
				await msg.reply('Usage: `!get <key>`');
				return;
			}
			const getKey = parts[1].toLowerCase();
			const value = await getConfigValue(parts[1])
				.catch(err => {
					console.error('Error getting config value:', err);
					msg.reply(err.message);
					return null;
				});
			if (value !== null && value !== undefined) {
				const actualKey = Object.keys(userConfig).find(k => k.toLowerCase() === getKey);
				if (typeof value === 'object' && (getKey === 'groupinclusionlist' || getKey === 'groupexclusionlist')) {
					await msg.reply(`${actualKey}: ${value.map(group => `@${group.id}`).join(', ')}`, undefined, { groupMentions: value });
				}
				else if (getKey === 'commandchatid' || getKey === 'notificationchatid') {
					if (Array.isArray(value)) {
						await msg.reply(`${actualKey}: ${value.map(v => `@${v.id}`).join(', ')}`, undefined, { groupMentions: value });
					} else if (typeof value === 'string') {
						await msg.reply(`${actualKey}: ${value}`);
					}
				}
				else if (Array.isArray(value)) {
					msg.reply(`Value for "${actualKey}":\n\t${value.join(',\n\t')}`);
				} else if (typeof value === 'object') {
					msg.reply(`Value for "${actualKey}":\n\t${JSON.stringify(value, null, 2)}`);
				} else {
					msg.reply(`Value for "${actualKey}": ${value}`);
				}
			} else {
				msg.reply(`No value found for key: "${parts[1]}"`);
			}
			break;
		}
		case '!list': {
			// List all keys and values
			const configKeys = Object.keys(userConfig);
			if (configKeys.length > 0) {
				let response = 'Your current configurations:\n';
				let options: MessageSendOptions = {};
				for (const key of configKeys) {
					const value = await getConfigValue(key);
					if (value && typeof value === 'object' && (key === 'groupInclusionList' || key === 'groupExclusionList')) {
						const groups: { id: string, subject: string }[] = value;
						response += `- ${key}: ${groups.map(g => `@${g.id}`).join(', ')}\n`;
						options['groupMentions'] = groups;
					} else if (value && (key === 'commandChatId' || key === 'notificationChatId')) {
						if (typeof value === 'object') {
							const groups: { id: string, subject: string }[] = value;
							response += `- ${key}: ${groups.map(g => `@${g.id}`).join(', ')}\n`;
							options.groupMentions = (options.groupMentions ?? []).concat(groups);
						} else {
							response += `- ${key}: ${value}\n`;
						}
					} else if (value && typeof value === 'string') {
						response += `- ${key}: ${value}\n`;
					} else if (value) {
						response += `- ${key}: ${JSON.stringify(value)}\n`;
					} else {
						response += `- ${key}: (no value)\n`;
					}
				}
				await msg.reply(response.trim(), undefined, options);
			} else {
				await msg.reply('No configurations set yet.');
			}
			break;
		}
		case '!help': {
			const helpText = `*WhatsApp AI Filter Bot Commands:*

*General*
\`!help\` - Show this help message
\`!list\` - List all current configuration values
\`!get <key>\` - Get the value for a config key (e.g. \`!get interests\`)

*Set Preferences*
\`!set interests=<your interests (comma separated)>\` - Set your interests (e.g. \`!set interests=AI, WhatsApp automation\`)
\`!set processDirectMessages=on\`|\`off\` - Enable/disable direct message processing

*Group Filtering*
\`!set groups\` - Start interactive group inclusion/exclusion setup to choose which groups to include or exclude from processing

*Command/Notification Chat*
\`!set_command_chat\` - Set the current chat as the command channel
\`!set_notification_chat\` - Set the current chat as the notification channel

_You can always use !list to see your current settings._`;
			await msg.reply(helpText);
			break;
		}

		// !set_command_chat and !set_notification_chat commands are now handled directly in index.ts
		default:
			await msg.reply(`Unknown command: ${mainCommand}. Available commands: !set, !get, !list.
            To set command/notification chats, use '!set_command_chat' or '!set_notification_chat' in the desired chat.`);
	}
}