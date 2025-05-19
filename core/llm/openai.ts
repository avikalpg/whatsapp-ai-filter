// backend/src/llm/openai.ts
import axios from 'axios';

interface OpenAiResponse {
	choices?: { message: { content: string } }[];
	// Define other properties based on the OpenAI API response
}

async function analyzeMessageWithOpenAi(message: string): Promise<OpenAiResponse | null> {
	const openAiApiKey = process.env.OPENAI_API_KEY;
	const openAiApiUrl = 'https://api.openai.com/v1/chat/completions'; // Adjust API endpoint if needed

	if (!openAiApiKey) {
		console.warn('OpenAI API key not found in .env file.');
		return null;
	}

	try {
		const response = await axios.post<OpenAiResponse>(
			openAiApiUrl,
			{
				model: 'gpt-3.5-turbo', // Or your preferred model
				messages: [
					{
						role: 'user',
						content: message
					}
				]
			},
			{
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${openAiApiKey}`
				}
			}
		);

		console.log('OpenAI API Response (OpenAI):', response.data);
		return response.data;
	} catch (error: any) {
		console.error('Error calling OpenAI API:', error.message);
		return null;
	}
}

export { analyzeMessageWithOpenAi, OpenAiResponse };